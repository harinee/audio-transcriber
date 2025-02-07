import React, { useState, useRef } from 'react';
import './App.css';

interface TranscriptionResponse {
  text: string;
  duration: number;
}

interface TranscriptionStats {
  wordCount: number;
  duration: string;
}

function App() {
  const [transcription, setTranscription] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [stats, setStats] = useState<TranscriptionStats | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>();

  const drawAudioVisualization = () => {
    if (!analyserRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);
      analyserRef.current!.getByteTimeDomainData(dataArray);

      canvasCtx.fillStyle = 'rgb(200, 200, 200)';
      canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
      canvasCtx.lineWidth = 2;
      canvasCtx.strokeStyle = 'rgb(0, 123, 255)';
      canvasCtx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = v * canvas.height / 2;

        if (i === 0) {
          canvasCtx.moveTo(x, y);
        } else {
          canvasCtx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      canvasCtx.lineTo(canvas.width, canvas.height / 2);
      canvasCtx.stroke();
    };

    draw();
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      mediaRecorder.start();
      setIsRecording(true);
      drawAudioVisualization();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      const errorMessage = `
Unable to access microphone

This could be due to:
- Microphone permissions not granted
- No microphone connected
- Another application using the microphone

Please try:
1. Clicking the microphone icon in your browser and allowing access
2. Checking if your microphone is properly connected
3. Closing other applications that might be using the microphone
`;
      alert(errorMessage);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // Create a File object from Blob to ensure proper extension
        const audioFile = new File([audioBlob], 'recording.wav', { type: 'audio/wav' });
        await handleAudioUpload(audioFile);
      };
      setIsRecording(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size
    if (file.size > 1024 * 1024 * 1024) { // 1GB
      alert('File size must be less than 1GB');
      return;
    }

    // Get file extension and type
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    console.log('File details:', {
      name: file.name,
      type: file.type,
      extension: fileExt
    });

    // Map of valid extensions to MIME types
    const validFormats: { [key: string]: string[] } = {
      'mp3': ['audio/mpeg', 'audio/mp3'],
      'wav': ['audio/wav', 'audio/wave', 'audio/x-wav'],
      'm4a': ['audio/m4a', 'audio/mp4', 'audio/x-m4a'],
      'ogg': ['audio/ogg', 'audio/vorbis'],
      'flac': ['audio/flac', 'audio/x-flac']
    };

    // Check if extension is supported
    if (!fileExt || !validFormats[fileExt]) {
      alert(`Unsupported file extension: ${fileExt}\n\nSupported formats: MP3, WAV, M4A, OGG, FLAC`);
      return;
    }

    // Check if MIME type matches extension
    if (!validFormats[fileExt].includes(file.type) && file.type !== '') {
      console.warn(`Warning: File MIME type ${file.type} doesn't match extension ${fileExt}`);
    }

    await handleAudioUpload(file);
    
    // Clear the input to allow uploading the same file again
    event.target.value = '';
  };

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const handleAudioUpload = async (audioBlob: Blob) => {
    setIsLoading(true);
    const formData = new FormData();
    formData.append('file', audioBlob);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', 'http://localhost:8000/transcribe');
      
      // Log request details
      console.log('Sending transcription request:', {
        url: 'http://localhost:8000/transcribe',
        fileType: audioBlob.type,
        fileSize: audioBlob.size
      });
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const progress = (event.loaded / event.total) * 100;
          setUploadProgress(progress);
        }
      };

      const result = await new Promise<TranscriptionResponse>((resolve, reject) => {
        xhr.responseType = 'json';
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('Transcription successful:', xhr.response);
            resolve(xhr.response as TranscriptionResponse);
          } else {
            console.error('Transcription failed:', {
              status: xhr.status,
              response: xhr.response,
              statusText: xhr.statusText
            });
            reject(new Error(`Upload failed: ${xhr.statusText}`));
          }
        };
        xhr.onerror = () => {
          console.error('Network error during transcription');
          reject(new Error('Network error during upload'));
        };
        xhr.send(formData);
      });
      setTranscription(result.text);
      
      // Calculate stats
      const wordCount = result.text.trim().split(/\s+/).length;
      setStats({
        wordCount,
        duration: formatDuration(result.duration)
      });
    } catch (error) {
      console.error('Error during transcription:', error);
      
      let errorResponse;
      try {
        errorResponse = await (error instanceof Error && error.message === 'Upload failed' 
          ? Promise.reject(error)
          : (error as Response).json());
      } catch {
        if (!navigator.onLine) {
          alert('Network error: Please check your internet connection and try again.');
          return;
        }
        alert('Failed to connect to the server. Please ensure the backend server is running.');
        return;
      }

      const errorCode = errorResponse?.error_code;
      let errorMessage = errorResponse?.detail || 'Transcription failed';

      switch (errorCode) {
        case 'NO_FILE_ERROR':
          errorMessage = 'Please select an audio file to transcribe.';
          break;
        case 'UNSUPPORTED_FORMAT':
          errorMessage = 'This file format is not supported. Please use MP3, WAV, M4A, OGG, or FLAC files.';
          break;
        case 'FILE_TOO_LARGE':
          errorMessage = `File is too large (max 1GB).
          
Try:
1. Using a smaller audio file
2. Recording a shorter audio clip
3. Compressing the audio file`;
          break;
        case 'NO_SPEECH_DETECTED':
          errorMessage = 'No speech was detected in the audio file. Please ensure the file contains speech.';
          break;
        case 'FILE_READ_ERROR':
          errorMessage = 'Failed to read the audio file. The file might be corrupted.';
          break;
        case 'TRANSCRIPTION_ERROR':
          errorMessage = `Failed to transcribe audio.
          
Please ensure:
1. The file contains valid audio content
2. The audio is clear and audible
3. The file is not corrupted`;
          break;
        case 'MODEL_INITIALIZATION_ERROR':
          errorMessage = 'The transcription service is temporarily unavailable. Please try again later.';
          break;
        case 'INTERNAL_SERVER_ERROR':
          errorMessage = `An unexpected error occurred (ID: ${errorResponse.error_id}).
          
Please try again later or report this error ID if the problem persists.`;
          break;
        default:
          errorMessage = `Transcription failed: ${errorMessage}
          
Please try:
1. Using a different audio file
2. Converting to a common format (MP3, WAV)
3. Checking your connection`;
      }
      
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcription);
      const button = document.querySelector('.copy-button') as HTMLButtonElement;
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.backgroundColor = '#28a745';
        setTimeout(() => {
          button.textContent = originalText;
          button.style.backgroundColor = '';
        }, 2000);
      }
    } catch (error) {
      alert('Failed to copy to clipboard. Please try selecting and copying the text manually.');
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Audio Transcriber</h1>
      </header>
      <main>
        <div className="controls">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={isRecording ? 'recording' : ''}
            disabled={isLoading}
          >
            {isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <div className="file-upload">
            <input
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,.flac,audio/mpeg,audio/wav,audio/m4a,audio/ogg,audio/flac"
              onChange={handleFileUpload}
              id="file-upload"
              disabled={isLoading || isRecording}
            />
            <label htmlFor="file-upload" className={isLoading || isRecording ? 'disabled' : ''}>
              Upload Audio File
            </label>
          </div>
        </div>

        <canvas ref={canvasRef} className="audio-visualizer" height="60" />
        
        {isLoading && (
          <div className="loading-container">
            <div className="loading">Transcribing...</div>
            {uploadProgress > 0 && uploadProgress < 100 && (
              <div className="progress-bar">
                <div 
                  className="progress-bar-fill" 
                  style={{ width: `${uploadProgress}%` }}
                />
                <span className="progress-text">{Math.round(uploadProgress)}%</span>
              </div>
            )}
          </div>
        )}

        {transcription && (
          <div className="transcription-container">
            <h2>Transcription</h2>
            <div className="transcription-stats">
              {stats && (
                <>
                  <span>Words: {stats.wordCount}</span>
                  <span>Duration: {stats.duration}</span>
                </>
              )}
            </div>
            <div className="transcription-text">
              {transcription.split('\n\n').map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
            <div className="transcription-actions">
              <button onClick={copyToClipboard} className="copy-button">
                Copy to Clipboard
              </button>
              <a 
                href={`data:text/plain;charset=utf-8,${encodeURIComponent(transcription)}`}
                download="transcription.txt"
                className="download-button"
              >
                Download as Text
              </a>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
