import pytest
from fastapi.testclient import TestClient
from main import app
import io
import wave
import numpy as np
from unittest.mock import patch, MagicMock

client = TestClient(app)

@pytest.fixture
def sample_audio_file():
    # Create a simple WAV file for testing
    audio_data = np.sin(2 * np.pi * 440 * np.linspace(0, 1, 44100))
    audio_bytes = io.BytesIO()
    with wave.open(audio_bytes, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(44100)
        wav.writeframes((audio_data * 32767).astype(np.int16).tobytes())
    audio_bytes.seek(0)
    return audio_bytes

@pytest.fixture
def mock_whisper_result():
    return {
        "text": "This is a test transcription",
        "segments": [{"end": 10.5}]
    }

def test_transcribe_endpoint_no_file():
    response = client.post("/transcribe")
    assert response.status_code == 422

@patch('whisper.load_model')
def test_transcribe_endpoint_with_file(mock_load_model, sample_audio_file, mock_whisper_result):
    # Mock the whisper model
    mock_model = MagicMock()
    mock_model.transcribe.return_value = mock_whisper_result
    mock_load_model.return_value = mock_model

    files = {"file": ("test.wav", sample_audio_file, "audio/wav")}
    response = client.post("/transcribe", files=files)
    
    assert response.status_code == 200
    assert response.json() == {
        "text": "This is a test transcription",
        "duration": 10.5
    }
    mock_model.transcribe.assert_called_once()

def test_transcribe_endpoint_large_file():
    # Create a file larger than 1GB
    large_file = io.BytesIO(b"0" * (1024 * 1024 * 1024 + 1))
    files = {"file": ("large.wav", large_file, "audio/wav")}
    response = client.post("/transcribe", files=files)
    assert response.status_code == 400
    assert "File too large" in response.json()["detail"]

@patch('whisper.load_model')
def test_transcribe_endpoint_processing_error(mock_load_model, sample_audio_file):
    # Mock the whisper model to raise an exception
    mock_model = MagicMock()
    mock_model.transcribe.side_effect = Exception("Processing error")
    mock_load_model.return_value = mock_model

    files = {"file": ("test.wav", sample_audio_file, "audio/wav")}
    response = client.post("/transcribe", files=files)
    
    assert response.status_code == 500
    assert "Processing error" in response.json()["detail"]

def test_cors_headers():
    response = client.options("/transcribe", headers={
        "origin": "http://localhost:3000",
        "access-control-request-method": "POST"
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in response.headers["access-control-allow-methods"]

@pytest.mark.asyncio
async def test_file_cleanup(sample_audio_file):
    import tempfile
    import os
    
    # Track created temporary files
    original_tempfile = tempfile.NamedTemporaryFile
    created_files = []
    
    def mock_named_temp_file(*args, **kwargs):
        temp_file = original_tempfile(*args, **kwargs)
        created_files.append(temp_file.name)
        return temp_file
    
    with patch('tempfile.NamedTemporaryFile', mock_named_temp_file):
        with patch('whisper.load_model'):
            files = {"file": ("test.wav", sample_audio_file, "audio/wav")}
            response = client.post("/transcribe", files=files)
            
            # Verify temporary file was cleaned up
            for file_path in created_files:
                assert not os.path.exists(file_path), f"Temporary file {file_path} was not cleaned up"
