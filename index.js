const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const cheerio = require('cheerio');
require('dotenv').config();

const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_API_KEY });

// Use CORS middleware
app.use(cors());

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {}
});

// Upload API endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    if (req.file.size > 10 * 1024 * 1024) { // Check if file size exceeds 100MB
        return res.status(400).send('File size exceeds limit (10MB).');
    }

    const randomFilename = crypto.randomBytes(5).toString('hex'); // Generate random filename
    const fileExtension = req.file.originalname.split('.').pop(); // Extract file extension
    const sanitizedFilename = randomFilename + '.' + fileExtension; // Combine random string and extension
    const encodedFilename = encodeURIComponent(sanitizedFilename); // Encode filename

    try {
        let requestOptions = {
            owner: 'M1noa',
            repo: 'files',
            path: sanitizedFilename, // Use sanitized filename
            message: 'Upload file',
            content: req.file.buffer.toString('base64')
        };

        if (req.file.size > 100000) {
            requestOptions.headers = {
                'Accept': 'application/vnd.github.v3.raw'
            };
        }

        await octokit.repos.createOrUpdateFileContents(requestOptions);

        res.status(200).send(encodedFilename); // Send encoded filename
    } catch (error) {
        console.error('Error uploading file to GitHub:', error);
        res.status(500).send('Error uploading file to GitHub.');
    }
});

// Upload Letters API endpoint
app.post('/api/upload/letter', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    if (req.file.size > 10 * 1024 * 1024) { // Check if file size exceeds 100MB
        return res.status(400).send('File size exceeds limit (10MB).');
    }

    const randomFilename = crypto.randomBytes(6).toString('hex'); // Generate random filename
    const fileExtension = req.file.originalname.split('.').pop(); // Extract file extension
    const sanitizedFilename = randomFilename + '.' + fileExtension; // Combine random string and extension
    const encodedFilename = encodeURIComponent(sanitizedFilename); // Encode filename
    const letterFilename = 'letters/' + sanitizedFilename; // Combine random string and extension

    try {
        let requestOptions = {
            owner: 'M1noa',
            repo: 'files',
            path: letterFilename, // Use sanitized filename
            message: 'Upload file',
            content: req.file.buffer.toString('base64')
        };

        if (req.file.size > 100000) {
            requestOptions.headers = {
                'Accept': 'application/vnd.github.v3.raw'
            };
        }

        await octokit.repos.createOrUpdateFileContents(requestOptions);

        res.status(200).send(encodedFilename); // Send encoded filename
    } catch (error) {
        console.error('Error uploading file to GitHub:', error);
        res.status(500).send('Error uploading file to GitHub.');
    }
});

app.get('/api/view/:filename', async (req, res) => {
    const filename = req.params.filename;

    try {
        // Fetch the raw URL of the file from GitHub
        const response = await octokit.repos.getContent({
            owner: 'M1noa',
            repo: 'files',
            path: filename
        });

        // Ensure the file is a file and not a directory
        if (response.data.type !== 'file') {
            return res.status(400).send('Specified path is not a file.');
        }

        const rawUrl = response.data.download_url;

        // Fetch the raw file contents
        const rawResponse = await axios.get(rawUrl, {
            responseType: 'arraybuffer'
        });

        // Set the appropriate content type
        const contentType = response.data.type;

        // Send the raw file contents
        res.set('Content-Type', contentType);
        res.send(rawResponse.data);
    } catch (error) {
        console.error('Error fetching file from GitHub:', error);
        res.status(500).send('An error occurred');
    }
});

app.get('/api/view/letter/:filename', async (req, res) => {
    const filename = 'letters/' + req.params.filename;

    try {
        // Fetch the raw URL of the file from GitHub
        const response = await octokit.repos.getContent({
            owner: 'M1noa',
            repo: 'files',
            path: filename
        });

        // Ensure the file is a file and not a directory
        if (response.data.type !== 'file') {
            return res.status(400).send('Specified path is not a file.');
        }

        const rawUrl = response.data.download_url;

        // Fetch the raw file contents
        const rawResponse = await axios.get(rawUrl, {
            responseType: 'arraybuffer'
        });

        // Set the appropriate content type
        const contentType = response.data.type;

        // Send the raw file contents
        res.set('Content-Type', contentType);
        res.send(rawResponse.data);
    } catch (error) {
        console.error('Error fetching file from GitHub:', error);
        res.status(500).send('An error occurred');
    }
});

// Function to fetch content with retry logic
const fetchContentWithRetry = async (url, attempt = 1) => {
    try {
        console.log(`Fetching content from: ${url} (Attempt ${attempt})`);
        const response = await axios.get(url);
        console.log(`Fetched content from: ${url} (Attempt ${attempt})`);
        return response.data;
    } catch (error) {
        console.error(`Error fetching content from: ${url} (Attempt ${attempt})`);
        if (attempt < 2) {
            console.log(`Retrying content from: ${url} (Attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add delay between retries (1 second)
            return fetchContentWithRetry(url, attempt + 1);
        } else {
            console.error(`Failed to fetch content from: ${url} after 2 attempts. Skipping.`);
            return null; // Skip this URL
        }
    }
};

// New route to fetch the tron.exe file
app.get('/tron', async (req, res) => {
    try {
        const url = 'https://bmrf.org/repos/tron/';
        const { data } = await axios.get(url);
        
        // Load the HTML with cheerio
        const $ = cheerio.load(data);
        let latestTronExe = null;

        // Find the latest tron.exe link
        $('a').each((index, element) => {
            const href = $(element).attr('href');
            if (href && href.endsWith('.exe')) {
                latestTronExe = href;
            }
        });

        if (latestTronExe) {
            // Redirect to the latest tron.exe
            return res.redirect(`https://bmrf.org/repos/tron/${latestTronExe}`);
        } else {
            return res.status(404).send('No tron.exe found.');
        }
    } catch (error) {
        console.error('Error fetching tron.exe:', error);
        return res.status(500).send('An error occurred while fetching the tron.exe.');
    }
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});
app.get('/favicon.ico', (req, res) => {
    res.sendFile(__dirname + '/favicon.ico');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
