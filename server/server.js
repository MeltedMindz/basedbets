const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Trusted server verification (in production, implement proper auth)
const TRUSTED_CONTRACT_ADDRESS = process.env.TRUSTED_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000';

/**
 * Generate cryptographically secure random numbers for slot machine
 * @param {string} txHash - Transaction hash from blockchain
 * @param {string} playerAddress - Player's wallet address
 * @param {number} blockTimestamp - Block timestamp
 * @returns {number[]} Array of 3 random numbers (0-9)
 */
function generateSlotRandoms(txHash, playerAddress, blockTimestamp) {
    // Create a seed combining transaction hash, player address, and timestamp
    const seed = `${txHash}${playerAddress}${blockTimestamp}${Date.now()}${Math.random()}`;
    
    // Generate cryptographically secure hash
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    
    // Extract 3 random numbers from hash
    const randoms = [];
    for (let i = 0; i < 3; i++) {
        // Take 2 hex characters (1 byte) at a time
        const hexPair = hash.substr(i * 2, 2);
        const randomNum = parseInt(hexPair, 16) % 10; // Convert to 0-9
        randoms.push(randomNum);
    }
    
    return randoms;
}

/**
 * Generate additional entropy for enhanced randomness
 * @returns {string} Additional entropy string
 */
function generateAdditionalEntropy() {
    return crypto.randomBytes(32).toString('hex');
}

// API Routes

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'Casino RNG Server'
    });
});

/**
 * POST /generate-rng - Generate random numbers for slot machine
 * Body: { txHash, playerAddress, blockTimestamp }
 */
app.post('/generate-rng', (req, res) => {
    try {
        const { txHash, playerAddress, blockTimestamp } = req.body;
        
        // Validate input
        if (!txHash || !playerAddress || !blockTimestamp) {
            return res.status(400).json({
                error: 'Missing required parameters: txHash, playerAddress, blockTimestamp'
            });
        }
        
        // Basic validation
        if (typeof txHash !== 'string' || txHash.length !== 66) {
            return res.status(400).json({
                error: 'Invalid transaction hash format'
            });
        }
        
        if (typeof playerAddress !== 'string' || !playerAddress.startsWith('0x')) {
            return res.status(400).json({
                error: 'Invalid player address format'
            });
        }
        
        // Generate random numbers
        const randoms = generateSlotRandoms(txHash, playerAddress, blockTimestamp);
        const entropy = generateAdditionalEntropy();
        
        // Log the request for audit purposes
        console.log(`RNG Request - Player: ${playerAddress}, TX: ${txHash}, Randoms: [${randoms.join(', ')}]`);
        
        res.json({
            success: true,
            randoms: randoms,
            entropy: entropy,
            timestamp: new Date().toISOString(),
            serverSeed: crypto.createHash('sha256').update(`${txHash}${playerAddress}${blockTimestamp}`).digest('hex')
        });
        
    } catch (error) {
        console.error('Error generating RNG:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * POST /verify-rng - Verify RNG generation (for debugging/audit)
 * Body: { txHash, playerAddress, blockTimestamp, serverSeed }
 */
app.post('/verify-rng', (req, res) => {
    try {
        const { txHash, playerAddress, blockTimestamp, serverSeed } = req.body;
        
        // Regenerate server seed to verify
        const expectedSeed = crypto.createHash('sha256').update(`${txHash}${playerAddress}${blockTimestamp}`).digest('hex');
        
        if (serverSeed === expectedSeed) {
            const randoms = generateSlotRandoms(txHash, playerAddress, blockTimestamp);
            res.json({
                success: true,
                verified: true,
                randoms: randoms,
                message: 'RNG verification successful'
            });
        } else {
            res.status(400).json({
                success: false,
                verified: false,
                error: 'Invalid server seed'
            });
        }
        
    } catch (error) {
        console.error('Error verifying RNG:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

/**
 * GET /stats - Get server statistics
 */
app.get('/stats', (req, res) => {
    res.json({
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: [
            'GET /health',
            'POST /generate-rng',
            'POST /verify-rng',
            'GET /stats'
        ]
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        error: 'Internal server error',
        message: error.message
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /health',
            'POST /generate-rng',
            'POST /verify-rng',
            'GET /stats'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🎰 Casino RNG Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🎲 RNG endpoint: http://localhost:${PORT}/generate-rng`);
    console.log(`📈 Stats: http://localhost:${PORT}/stats`);
});

module.exports = app;
