from fastapi import FastAPI, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Audio Transcriber API")

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = datetime.now()
    response = None
    try:
        response = await call_next(request)
        process_time = (datetime.now() - start_time).total_seconds()
        logger.info(
            f"Path: {request.url.path} "
            f"Method: {request.method} "
            f"Status: {response.status_code} "
            f"Duration: {process_time:.3f}s"
        )
        return response
    except Exception as e:
        logger.error(
            f"Request failed: {request.url.path} "
            f"Method: {request.method} "
            f"Error: {str(e)}\n"
            f"Traceback: {traceback.format_exc()}"
        )
        if response is None:
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal server error"}
            )
        return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        f"Global exception handler caught: {str(exc)}\n"
        f"Path: {request.url.path}\n"
        f"Traceback: {traceback.format_exc()}"
    )
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"}
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
    raise

class TranscriptionResponse(BaseModel):
    text: str
    duration: float

@app.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio(file: UploadFile):
    logger.info(f"Received transcription request for file: {file.filename}")
    if not file:
        logger.warning("No audio file provided in request")
        raise HTTPException(status_code=400, detail="No audio file provided")
    
    # Check file extension and content type
    file_ext = os.path.splitext(file.filename)[1].lower()
    content_type = file.content_type.lower() if file.content_type else ''
    
    allowed_extensions = {
        '.mp3': ['audio/mpeg', 'audio/mp3'],
        '.wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
        '.m4a': ['audio/m4a', 'audio/mp4'],
        '.ogg': ['audio/ogg'],
        '.flac': ['audio/flac', 'audio/x-flac']
    }
    
    if file_ext not in allowed_extensions:
        logger.warning(f"Unsupported file extension: {file_ext}")
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file extension: {file_ext}. Supported formats: {', '.join(allowed_extensions.keys())}"
        )
    
    if content_type and not any(ct in content_type for ct in allowed_extensions[file_ext]):
        logger.warning(f"Unexpected content type {content_type} for extension {file_ext}")
    
    # Check file size (1GB limit)
    file_size = 0
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_ext)
    logger.info(f"Created temporary file: {temp_file.name}")
    
    try:
        # Stream the file to avoid memory issues
        logger.info("Starting file upload stream")
        while chunk := await file.read(1024 * 1024):  # Read 1MB at a time
            file_size += len(chunk)
            if file_size > 1024 * 1024 * 1024:  # 1GB
                logger.warning(f"File too large: {file_size} bytes")
                raise HTTPException(status_code=400, detail="File too large")
            temp_file.write(chunk)
        
        temp_file.close()
        logger.info(f"File upload complete. Size: {file_size} bytes")
        
        # Process the audio file
        try:
            logger.info("Starting transcription")
            result = model.transcribe(temp_file.name)
            logger.info("Transcription completed successfully")
            
            response = TranscriptionResponse(
                text=result["text"],
                duration=result["segments"][-1]["end"] if result["segments"] else 0
            )
            logger.info(f"Transcription stats: {len(result['text'])} chars, {response.duration:.2f} seconds")
            return response
            
        except Exception as e:
            logger.error(f"Transcription failed: {str(e)}\n{traceback.format_exc()}")
            raise HTTPException(
                status_code=400,
                detail="Failed to transcribe audio. Please ensure the file contains valid audio content."
            )
    
    except Exception as e:
        logger.error(f"Request processing failed: {str(e)}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Clean up
        try:
            os.unlink(temp_file.name)
            logger.info(f"Cleaned up temporary file: {temp_file.name}")
        except Exception as e:
            logger.error(f"Failed to clean up temporary file: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
