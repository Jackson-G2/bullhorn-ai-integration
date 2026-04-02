/**
 * Bullhorn API Client
 * Handles authentication, candidate search, job description retrieval,
 * and candidate ranking updates.
 */

const axios = require('axios');

class BullhornClient {
  constructor(config) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.username = config.username;
    this.password = config.password;
    this.restUrl = null;
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Authenticate with Bullhorn OAuth 2.0
   * Returns the BhRestToken for API calls
   */
  async authenticate() {
    console.log('Authenticating with Bullhorn...');

    // Step 1: Get access token
    const tokenResponse = await axios.post(
      'https://auth.bullhornstaffing.com/oauth/token',
      new URLSearchParams({
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username: this.username,
        password: this.password,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    // Step 2: Get session token (BhRestToken)
    const loginResponse = await axios.get(
      'https://rest.bullhornstaffing.com/rest-services/login',
      { params: { access_token: accessToken } }
    );

    this.restUrl = loginResponse.data.restUrl;
    this.token = loginResponse.data.BhRestToken;
    this.tokenExpiry = Date.now() + (8 * 60 * 60 * 1000); // 8 hours

    console.log('Authentication successful');
    return this;
  }

  /**
   * Ensure we have a valid authentication token
   */
  async ensureAuth() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      await this.authenticate();
    }
  }

  /**
   * Search for candidates associated with a job order
   */
  async searchCandidates(jobOrderId) {
    await this.ensureAuth();

    const url = `${this.restUrl}search/Candidate`;
    const response = await axios.get(url, {
      params: {
        BhRestToken: this.token,
        query: `jobSubmissions.jobOrder.id:${jobOrderId}`,
        fields: 'id,firstName,lastName,description,primarySkills',
        count: 500,
      },
    });

    return response.data.data;
  }

  /**
   * Get the job description for a specific job order
   */
  async getJobDescription(jobOrderId) {
    await this.ensureAuth();

    const url = `${this.restUrl}entity/JobOrder/${jobOrderId}`;
    const response = await axios.get(url, {
      params: {
        BhRestToken: this.token,
        fields: 'id,title,description,publicDescription',
      },
    });

    const data = response.data.data;
    return data.publicDescription || data.description || data.title || '';
  }

  /**
   * Update a candidate's ranking field in Bullhorn
   */
  async updateCandidateRank(candidateId, rank, rankingField = 'customInt1') {
    await this.ensureAuth();

    const url = `${this.restUrl}entity/Candidate/${candidateId}`;
    const payload = { [rankingField]: rank };

    const response = await axios.post(url, payload, {
      params: { BhRestToken: this.token },
    });

    return response.data;
  }
}

module.exports = BullhornClient;
