export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

// Helper to retrieve the "db" query parameter from the current URL
const getDbParam = () => {
  const queryParams = new URLSearchParams(window.location.search);
  return queryParams.get('db') || '';
};

// Helper to construct a URL with the db parameter and other query params
const buildUrl = (endpoint, params = {}) => {
  const url = new URL(`${API_BASE}/${endpoint}`);
  
  // Automatically append the db parameter if it exists
  const db = getDbParam();
  if (db) {
    url.searchParams.set('db', db);
  }
  
  // Append other query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  
  return url.toString();
};

// Centralized API Client
export const api = {
  // Get all templates, or get details of a specific template by ID or parent_id
  getTemplates: async (id = null, parent_id = null, pattern = null, qpcode = null) => {
    const params = {};
    if (id) params.id = id;
    if (parent_id) params.parent_id = parent_id;
    if (pattern) params.pattern = pattern;
    if (qpcode) params.qpcode = qpcode;
    const url = buildUrl('get_templates', params);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch templates (Status: ${response.status})`);
    }
    return response.json();
  },

  // Save/Create a new template config
  saveTemplate: async (formData) => {
    try {
      const url = buildUrl('save_template');
      const response = await fetch(url, {
        method: 'POST',
        body: formData, // fetch handles multipart/form-data boundary automatically
      });
      if (!response.ok) {
        throw new Error(`Failed to save template (Status: ${response.status})`);
      }
      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Save template API Error:', error);
      throw error;
    }
  },

  // Delete a template
  deleteTemplate: async (id) => {
    const url = buildUrl(`delete_template/${id}`);
    const response = await fetch(url, {
      method: 'DELETE',
    });
    if (!response.ok) {
      throw new Error(`Failed to delete template (Status: ${response.status})`);
    }
    return response.json();
  },

  // Upload scanned OMR sheet image
  uploadScan: async (formData) => {
    const url = buildUrl('upload_scan');
    const response = await fetch(url, {
      method: 'POST',
      body: formData,
    });
    if (!response.ok) {
      throw new Error(`Failed to upload scan (Status: ${response.status})`);
    }
    return response.json();
  },

  // Save scanned OMR sheet responses (handles both JSON and FormData/multipart)
  saveResponse: async (payload) => {
    const url = buildUrl('save_response');
    const isFormData = payload instanceof FormData;
    const response = await fetch(url, {
      method: 'POST',
      headers: isFormData ? {} : { 'Content-Type': 'application/json' },
      body: isFormData ? payload : JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Failed to save responses (Status: ${response.status})`);
    }
    return response.json();
  },

  // Save the correct answer key for a template
  saveAnswerKey: async (payload) => {
    const url = buildUrl('save_answer_key');
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Failed to save answer key (Status: ${response.status})`);
    }
    return response.json();
  },

  // Get distinct QP Codes available for a template
  getQpCodes: async (templateId) => {
    const url = buildUrl('get_qpcodes', { template_id: templateId });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch QP Codes (Status: ${response.status})`);
    }
    return response.json();
  },

  // Compare results against the answer key
  compare: async (templateId, page = 1, limit = 20, qpcode = '') => {
    const params = { template_id: templateId, page, limit };
    if (qpcode) params.qpcode = qpcode;
    const url = buildUrl('compare', params);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to perform comparison (Status: ${response.status})`);
    }
    return response.json();
  }
};
