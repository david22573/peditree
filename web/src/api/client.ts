import { Dog, Parentage, Workspace, WorkspaceSnapshot, ExportData } from '../types';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody.error) errorMsg = errBody.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, errorMsg);
  }

  return res.json();
}

export const api = {
  // Workspaces
  async listWorkspaces(): Promise<Workspace[]> {
    return fetchJSON('/api/v1/workspaces');
  },

  async createWorkspace(name: string): Promise<Workspace> {
    return fetchJSON('/api/v1/workspaces', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async getSnapshot(workspaceId: string): Promise<WorkspaceSnapshot> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/snapshot`);
  },

  async exportWorkspace(workspaceId: string): Promise<ExportData> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/export`);
  },

  async importWorkspace(workspaceId: string, data: ExportData): Promise<Workspace> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async backupDatabase(workspaceId: string): Promise<{ backup_path: string; status: string }> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/backup`, {
      method: 'POST',
    });
  },

  // Dogs
  async createDog(workspaceId: string, dog: Partial<Dog>): Promise<Dog> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/dogs`, {
      method: 'POST',
      body: JSON.stringify(dog),
    });
  },

  async getDog(dogId: string): Promise<Dog> {
    return fetchJSON(`/api/v1/dogs/${dogId}`);
  },

  async updateDog(dogId: string, patch: Partial<Dog>): Promise<Dog> {
    return fetchJSON(`/api/v1/dogs/${dogId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },

  async deleteDog(dogId: string, version: number): Promise<{ dog: Dog; affected_relationships: Parentage[] }> {
    return fetchJSON(`/api/v1/dogs/${dogId}`, {
      method: 'DELETE',
      body: JSON.stringify({ version }),
    });
  },

  async restoreDog(dogId: string): Promise<Dog> {
    return fetchJSON(`/api/v1/dogs/${dogId}/restore`, {
      method: 'POST',
    });
  },

  // Parentage
  async createParentage(workspaceId: string, p: Partial<Parentage>): Promise<Parentage> {
    return fetchJSON(`/api/v1/workspaces/${workspaceId}/parentage`, {
      method: 'POST',
      body: JSON.stringify(p),
    });
  },

  async updateParentage(relationshipId: string, p: Partial<Parentage>): Promise<Parentage> {
    return fetchJSON(`/api/v1/parentage/${relationshipId}`, {
      method: 'PATCH',
      body: JSON.stringify(p),
    });
  },

  async deleteParentage(relationshipId: string): Promise<{ status: string }> {
    return fetchJSON(`/api/v1/parentage/${relationshipId}`, {
      method: 'DELETE',
    });
  },
};
