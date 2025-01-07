from fastapi import FastAPI, UploadFile, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
import whisper
import tempfile
import os
import shutil
from pydantic import BaseModel
import asyncio
from typing import Optional
import logging
import traceback
from datetime import datetime
import uuid

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class AudioProcessingError(Exception):
    """Custom exception for audio processing errors"""
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST, error_code: str = None):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or "AUDIO_PROCESSING_ERROR"
        super().__init__(self.message)

class FileValidationError(Exception):
    """Custom exception for file validation errors"""
    def __init__(self, message: str, status_code: int = status.HTTP_400_BAD_REQUEST, error_code: str = None):
        self.message = message
        self.status_code = status_code
        self.error_code = error_code or "FILE_VALIDATION_ERROR"
        super().__init__(self.message)

app = FastAPI(title="Audio Transcriber API")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    request_id = str(uuid.uuid4())
    start_time = datetime.now()
    response = None
    try:
        logger.info(f"Request {request_id} started - Path: {request.url.path} Method: {request.method}")
        response = await call_next(request)
        process_time = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"Request {request_id} completed - "
            f"Status: {response.status_code} "
            f"Duration: {process_time:.3f}s"
        )
        return response
    except Exception as e:
        logger.error(
            f"Request {request_id} failed - "
            f"Error: {str(e)}\n"
            f"Traceback: {traceback.format_exc()}"
        )
        if response is None:
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": "Internal server error",
                    "error_code": "INTERNAL_SERVER_ERROR",
                    "request_id": request_id
                }
            )
        return response

@app.exception_handler(AudioProcessingError)
async def audio_processing_exception_handler(request: Request, exc: AudioProcessingError):
    logger.error(f"Audio processing error: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "error_code": exc.error_code
        }
    )

@app.exception_handler(FileValidationError)
async def file_validation_exception_handler(request: Request, exc: FileValidationError):
    logger.error(f"File validation error: {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.message,
            "error_code": exc.error_code
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.error(f"Validation error: {str(exc)}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Invalid request format",
            "error_code": "VALIDATION_ERROR",
            "errors": exc.errors()
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    error_id = str(uuid.uuid4())
    logger.error(
        f"Unhandled error {error_id}: {str(exc)}\n"
        f"Traceback: {traceback.format_exc()}"
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "An unexpected error occurred",
            "error_code": "INTERNAL_SERVER_ERROR",
            "error_id": error_id
        }
    )

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Whisper model
try:
    logger.info("Initializing Whisper model...")
    model = whisper.load_model("base")
    logger.info("Whisper model initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize Whisper model: {str(e)}")
    raise AudioProcessingError(
        message="Failed to initialize transcription model",
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_code="MODEL_INITIALIZATION_ERROR"
    )

class TranscriptionResponse(BaseModel):
    text: str
    duration: float

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile):
    request_id = str(uuid.uuid4())
    logger.info(f"Request {request_id} - Processing file: {file.filename}")

    if not file:
        raise FileValidationError(
            message="No audio file provided",
            error_code="NO_FILE_ERROR"
        )

    # Validate file extension and type
    file_ext = os.path.splitext(file.filename)[1].lower()
    content_type = file.content_type.lower() if file.content_type else ''
    
    allowed_extensions = {
        '.mp3': ['audio/mpeg', 'audio/mp3'],
        '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav', 'audio/webm'],
        '.m4a': ['audio/m4a', 'audio/mp4', 'audio/x-m4a'],
        '.ogg': ['audio/ogg', 'audio/vorbis'],
        '.flac': ['audio/flac', 'audio/x-flac'],
        '': ['audio/wav', 'audio/webm']  # For recorded audio blobs
    }

    if file_ext not in allowed_extensions:
        raise FileValidationError(
            message=f"Unsupported file format. Supported formats: MP3, WAV, M4A, OGG, FLAC",
            error_code="UNSUPPORTED_FORMAT"
        )

    if content_type and not any(ct in content_type for ct in allowed_extensions[file_ext]):
        logger.warning(
            f"Request {request_id} - Content type mismatch warning: "
            f"Content-Type {content_type} for extension {file_ext}"
        )

    # Process file
    temp_file = None
    try:
        # Create temp file
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_ext)
        file_size = 0
        
        # Stream file content
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            file_size += len(chunk)
            if file_size > 1024 * 1024 * 1024:  # 1GB limit
                raise FileValidationError(
                    message="File size exceeds 1GB limit",
                    error_code="FILE_TOO_LARGE"
                )
            temp_file.write(chunk)
        
        temp_file.close()
        logger.info(f"Request {request_id} - File processed: {file_size} bytes")

        # Transcribe audio
        try:
            result = model.transcribe(temp_file.name)
            
            if not result or not result.get("text"):
                raise AudioProcessingError(
                    message="No speech detected in audio",
                    error_code="NO_SPEECH_DETECTED"
                )

            response = TranscriptionResponse(
                text=result["text"],
                duration=result["segments"][-1]["end"] if result["segments"] else 0
            )
            
            logger.info(
                f"Request {request_id} - Transcription successful: "
                f"{len(response.text)} chars, {response.duration:.2f}s"
            )
            return response

        except Exception as e:
            if "No such file" in str(e):
                raise FileValidationError(
                    message="Failed to read audio file",
                    error_code="FILE_READ_ERROR"
                )
            raise AudioProcessingError(
                message="Failed to transcribe audio. Please ensure the file contains valid audio content.",
                error_code="TRANSCRIPTION_ERROR"
            )

    except (AudioProcessingError, FileValidationError):
        raise
    except Exception as e:
        logger.error(
            f"Request {request_id} - Unexpected error: {str(e)}\n"
            f"Traceback: {traceback.format_exc()}"
        )
        raise AudioProcessingError(
            message="An unexpected error occurred while processing the audio",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            error_code="PROCESSING_ERROR"
        )

    finally:
        # Cleanup
        if temp_file and os.path.exists(temp_file.name):
            try:
                os.unlink(temp_file.name)
                logger.info(f"Request {request_id} - Cleaned up temporary file")
            except Exception as e:
                logger.error(f"Request {request_id} - Failed to clean up temporary file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
