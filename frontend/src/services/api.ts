// API service for communicating with the backend
// This file will contain API call functions

const API_BASE_URL = '/api';

export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return response.json();
}
