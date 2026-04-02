/**
 * LLM Ranker Client
 * Handles candidate ranking using Google Gemini API.
 */

const axios = require('axios');

// System prompt for Gemini
const SYSTEM_PROMPT = `You are an expert Recruitment Process Consultant and Senior Technical Recruiter with 15+ years of experience in candidate evaluation. Your goal is to critically evaluate candidates against a provided Job Description and rank each candidate on a scale of 1 to 4.

RANKING SCALE:
1 - Top Tier: Exceptional match. Meets all required and preferred skills with outstanding experience.
2 - Strong: Solid match. Meets all required skills and some preferred skills.
3 - Average: Meets most required skills but lacks key experience. May need upskilling.
4 - Unqualified: Does not meet the baseline requirements.

EVALUATION INSTRUCTIONS:
1. Critically analyze each Candidate's resume/description against the Job Description.
2. Be objective, data-driven, and thorough in your evaluation.
3. Consider both technical skills and relevant experience.
4. Be selective - reserve Rank 1 for truly exceptional candidates.
5. Evaluate EVERY candidate in the provided list. Do not skip any.
6. Return the results STRICTLY as a valid JSON array.
7. Do NOT include markdown formatting, conversational text, or explanations outside the JSON structure.

EXPECTED JSON FORMAT:
[
  {
    "candidate_id": 123456,
    "rank": 2,
    "justification": "Brief explanation of the ranking decision"
  }
]`;

class LLMRanker {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-1.5-flash';
    this.temperature = config.temperature || 0.2;
    this.maxRetries = config.maxRetries || 3;
  }

  async rankCandidates(jobDescription, candidates) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const userPrompt = `JOB DESCRIPTION:\n${jobDescription}\n\nCANDIDATES:\n${JSON.stringify(candidates, null, 2)}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            { text: userPrompt }
          ]
        }
      ],
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: 2000,
      }
    };

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: { 'Content-Type': 'application/json' }
        });

        const responseText = response.data.candidates[0].content.parts[0].text;
        console.log('Response received from Gemini');
        return this.parseResponse(responseText);
      } catch (error) {
        console.error(`Gemini API error (attempt ${attempt + 1}):`, error.message);
        if (attempt === this.maxRetries - 1) {
          throw new Error(`Failed to get rankings from Gemini after ${this.maxRetries} attempts: ${error.message}`);
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  parseResponse(responseText) {
    // Remove markdown code blocks if present
    let cleaned = responseText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      const rankings = JSON.parse(cleaned);

      if (!Array.isArray(rankings)) {
        throw new Error('Response is not a JSON array');
      }

      // Validate and filter rankings
      return rankings
        .filter(item => item && typeof item === 'object')
        .filter(item => item.candidate_id !== undefined && item.rank !== undefined)
        .map(item => ({
          candidate_id: parseInt(item.candidate_id, 10),
          rank: Math.min(4, Math.max(1, parseInt(item.rank, 10))),
          justification: item.justification || '',
        }));
    } catch (error) {
      console.error('Failed to parse Gemini response:', error.message);
      console.error('Response text:', responseText);
      throw new Error(`Failed to parse rankings: ${error.message}`);
    }
  }
}

module.exports = LLMRanker;
