import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

// Mock the MediaRecorder API
const mockMediaRecorder = {
  start: jest.fn(),
  stop: jest.fn(),
  ondataavailable: jest.fn(),
  onstop: jest.fn(),
};

global.MediaRecorder = jest.fn().mockImplementation(() => mockMediaRecorder);

// Mock getUserMedia
const mockGetUserMedia = jest.fn();
global.navigator.mediaDevices = {
  getUserMedia: mockGetUserMedia,
};

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock clipboard
const mockClipboard = {
  writeText: jest.fn(),
};
global.navigator.clipboard = mockClipboard;

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserMedia.mockResolvedValue('mock-stream');
  });

  test('renders main elements', () => {
    render(<App />);
    expect(screen.getByText('Audio Transcriber')).toBeInTheDocument();
    expect(screen.getByText('Start Recording')).toBeInTheDocument();
    expect(screen.getByText('Upload Audio File')).toBeInTheDocument();
  });

  test('handles recording state', async () => {
    render(<App />);
    const recordButton = screen.getByText('Start Recording');
    
    fireEvent.click(recordButton);
    await waitFor(() => {
      expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
      expect(screen.getByText('Stop Recording')).toBeInTheDocument();
    });
    
    fireEvent.click(screen.getByText('Stop Recording'));
    expect(mockMediaRecorder.stop).toHaveBeenCalled();
  });

  test('handles recording error', async () => {
    const mockError = new Error('Permission denied');
    mockGetUserMedia.mockRejectedValueOnce(mockError);
    
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    
    render(<App />);
    fireEvent.click(screen.getByText('Start Recording'));
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Error accessing microphone:', mockError);
      expect(alertSpy).toHaveBeenCalledWith('Error accessing microphone. Please ensure you have granted microphone permissions.');
    });
    
    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  test('handles file upload', async () => {
    const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'Test transcription', duration: 10 }),
    });

    render(<App />);
    const input = screen.getByLabelText('Upload Audio File');
    await userEvent.upload(input, file);

    expect(mockFetch).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Test transcription')).toBeInTheDocument();
    });
  });

  test('handles large file upload', async () => {
    const largeFile = new File([''], 'large.wav', {
      type: 'audio/wav',
    });
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 * 1024 }); // 2GB

    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();
    
    render(<App />);
    const input = screen.getByLabelText('Upload Audio File');
    await userEvent.upload(input, largeFile);

    expect(alertSpy).toHaveBeenCalledWith('File size must be less than 1GB');
    expect(mockFetch).not.toHaveBeenCalled();
    
    alertSpy.mockRestore();
  });

  test('handles transcription error', async () => {
    const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
    mockFetch.mockResolvedValueOnce({
      ok: false,
    });

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

    render(<App />);
    const input = screen.getByLabelText('Upload Audio File');
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith('Error during transcription. Please try again.');
    });

    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  test('handles copy to clipboard', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: 'Test transcription', duration: 10 }),
    });

    const alertSpy = jest.spyOn(window, 'alert').mockImplementation();

    render(<App />);
    const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
    const input = screen.getByLabelText('Upload Audio File');
    await userEvent.upload(input, file);

    await waitFor(() => {
      expect(screen.getByText('Copy to Clipboard')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Copy to Clipboard'));
    expect(mockClipboard.writeText).toHaveBeenCalledWith('Test transcription');
    expect(alertSpy).toHaveBeenCalledWith('Transcription copied to clipboard!');

    alertSpy.mockRestore();
  });

  test('disables controls during transcription', async () => {
    let resolveTranscription: (value: any) => void;
    mockFetch.mockImplementationOnce(() => new Promise((resolve) => {
      resolveTranscription = resolve;
    }));

    render(<App />);
    const file = new File(['audio content'], 'test.wav', { type: 'audio/wav' });
    const input = screen.getByLabelText('Upload Audio File');
    
    await userEvent.upload(input, file);
    
    expect(screen.getByText('Transcribing...')).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(screen.getByText('Start Recording')).toBeDisabled();
    
    resolveTranscription!({
      ok: true,
      json: () => Promise.resolve({ text: 'Test transcription', duration: 10 }),
    });
    
    await waitFor(() => {
      expect(screen.queryByText('Transcribing...')).not.toBeInTheDocument();
      expect(input).not.toBeDisabled();
      expect(screen.getByText('Start Recording')).not.toBeDisabled();
    });
  });
});
