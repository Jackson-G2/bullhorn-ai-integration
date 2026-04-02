/**
 * Bullhorn AI Integration - Main Entry Point
 * Orchestrates the candidate ranking process
 */

require('dotenv').config();

const BullhornClient = require('./bullhorn-client');
const LLMRanker = require('./llm-ranker');

const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '10', 10);
const RANKING_FIELD = process.env.RANKING_FIELD || 'customInt1';

async function runRanking(jobOrderId) {
  console.log(`Starting ranking for job order ${jobOrderId}`);

  // Initialize clients
  const bh = new BullhornClient({
    clientId: process.env.BH_CLIENT_ID,
    clientSecret: process.env.BH_CLIENT_SECRET,
    username: process.env.BH_USERNAME,
    password: process.env.BH_PASSWORD,
  });

  const ranker = new LLMRanker({
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    temperature: 0.2,
  });

  try {
    // Step 1: Authenticate with Bullhorn
    console.log('Authenticating with Bullhorn...');
    await bh.authenticate();
    console.log('Authentication successful');

    // Step 2: Get job description
    console.log('Fetching job description...');
    const jobDescription = await bh.getJobDescription(jobOrderId);
    if (!jobDescription) {
      throw new Error(`No job description found for job order ${jobOrderId}`);
    }
    console.log('Job description retrieved');

    // Step 3: Get candidates
    console.log('Fetching candidates...');
    const candidates = await bh.searchCandidates(jobOrderId);
    if (!candidates || candidates.length === 0) {
      console.log(`No candidates found for job order ${jobOrderId}`);
      return;
    }
    console.log(`Found ${candidates.length} candidates`);

    // Step 4: Process in batches
    const allRankings = [];
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} candidates`);

      try {
        const rankings = await ranker.rankCandidates(jobDescription, batch);
        allRankings.push(...rankings);
      } catch (error) {
        console.error(`Failed to process batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      }
    }

    // Step 5: Update Bullhorn with rankings
    console.log('Updating candidate rankings in Bullhorn...');
    let successCount = 0;
    let failCount = 0;

    for (const ranking of allRankings) {
      try {
        await bh.updateCandidateRank(ranking.candidate_id, ranking.rank, RANKING_FIELD);
        successCount++;
      } catch (error) {
        console.error(`Failed to update candidate ${ranking.candidate_id}:`, error.message);
        failCount++;
      }
    }

    console.log(`\nRanking complete for job order ${jobOrderId}`);
    console.log(`Success: ${successCount}, Failed: ${failCount}`);
  } catch (error) {
    console.error('Ranking process failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
const jobOrderId = parseInt(process.env.JOB_ORDER_ID, 10);
if (jobOrderId) {
  runRanking(jobOrderId);
} else {
  console.error('ERROR: JOB_ORDER_ID environment variable is required');
  console.error('Usage: JOB_ORDER_ID=12345 node src/index.js');
  process.exit(1);
}

module.exports = { runRanking };
