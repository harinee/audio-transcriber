# Audio Transcriber

A full-stack web application that transcribes audio files and recordings to text using OpenAI's Whisper model. Built with React and FastAPI.

## Features

- Upload audio files (MP3, WAV, M4A, OGG, FLAC) up to 1GB
- Record audio directly from microphone with live waveform visualization
- Progress bar for file uploads
- Word count and duration statistics
- Copy transcription to clipboard or download as text file
- Support for large files with streaming upload
- Response time < 30 seconds for most files
- Comprehensive error handling and logging
- Mobile-responsive design

## Prerequisites

- Python 3.11 or later
- Node.js 16 or later
- npm or yarn
- Git

## Installation

### Backend Setup

1. Create and activate a virtual environment:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Start the backend server:
```bash
uvicorn main:app --reload
```

The backend will be available at http://localhost:8000

### Frontend Setup

1. Install dependencies:
```bash
cd frontend
npm install
```

2. Start the development server:
```bash
npm start
```

The frontend will be available at http://localhost:3000

## Usage

1. **Upload Audio File**
   - Click "Upload Audio File" button
   - Select an audio file (MP3, WAV, M4A, OGG, or FLAC)
   - Wait for transcription to complete
   - View word count and duration statistics
   - Copy text or download as file

2. **Record Audio**
   - Click "Start Recording" button
   - Allow microphone access when prompted
   - Speak into your microphone (visualizer shows audio levels)
   - Click "Stop Recording" when finished
   - Wait for transcription to complete

## Error Handling

The application includes comprehensive error handling:

### Frontend
- ErrorBoundary component for React errors
- Global error handlers for unhandled promises
- Network error detection
- File type and size validation
- Visual feedback for all error states

### Backend
- Request logging middleware
- Global exception handler
- Detailed logging for file operations
- Structured error responses
- File format validation
- Memory-efficient file streaming

## Project Structure

```
audio-transcriber/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── requirements.txt     # Python dependencies
│   └── test_main.py        # Backend tests
├── frontend/
│   ├── src/
│   │   ├── App.tsx         # Main React component
│   │   ├── components/     # React components
│   │   └── ...
│   ├── package.json        # Node dependencies
│   └── ...
├── README.md
└── LICENSE
```

## Contributing

Contributions are welcome! Please read our contributing guidelines:

1. Fork the repository
2. Create a new branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: 
   ```bash
   # Backend tests
   cd backend
   pytest

   # Frontend tests
   cd frontend
   npm test
   ```
5. Commit with descriptive message: `git commit -m "Add feature"`
6. Push to your fork: `git push origin feature-name`
7. Create a Pull Request

### Code Style

- Python: Follow PEP 8
- TypeScript/React: Follow ESLint configuration
- Use meaningful variable names
- Add comments for complex logic
- Update tests for new features

## Recent Changes

- Added comprehensive error handling and logging
- Improved file type validation
- Added audio visualization during recording
- Enhanced UI with progress indicators
- Added word count and duration statistics
- Improved mobile responsiveness
- Added error boundary for better error handling
- Enhanced logging in backend

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [OpenAI Whisper](https://github.com/openai/whisper) for the speech recognition model
- [FastAPI](https://fastapi.tiangolo.com/) for the backend framework
- [React](https://reactjs.org/) for the frontend framework
