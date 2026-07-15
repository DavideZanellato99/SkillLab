/* API service for communicating with the FastAPI backend */

const API_BASE_URL = 'http://localhost:8000';

export interface Avatar {
  id: number;
  name: string;
  image_url: string;
  category: string;
  description: string | null;
  created_at: string;
  selection_count: number;
}

export interface UserSelection {
  id: number;
  avatar_id: number;
  selected_at: string;
  avatar: Avatar;
}

export interface MessageResponse {
  message: string;
  success: boolean;
}

/**
 * Fetch all avatars, optionally filtered by category.
 */
export async function fetchAvatars(category?: string): Promise<Avatar[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  const response = await fetch(`${API_BASE_URL}/api/avatars${params}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch avatars: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Fetch all distinct avatar categories.
 */
export async function fetchCategories(): Promise<string[]> {
  const response = await fetch(`${API_BASE_URL}/api/avatars/categories`);
  if (!response.ok) {
    throw new Error(`Failed to fetch categories: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Select an avatar (save the selection to the database).
 */
export async function selectAvatar(avatarId: number): Promise<MessageResponse> {
  const response = await fetch(`${API_BASE_URL}/api/avatars/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ avatar_id: avatarId }),
  });
  if (!response.ok) {
    throw new Error(`Failed to select avatar: ${response.statusText}`);
  }
  return response.json();
}

/**
 * Get the full image URL for an avatar.
 */
export function getAvatarImageUrl(imageUrl: string): string {
  if (imageUrl.startsWith('http')) {
    return imageUrl;
  }
  return `${API_BASE_URL}${imageUrl}`;
}
