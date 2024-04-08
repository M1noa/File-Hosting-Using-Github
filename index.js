const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_API_KEY });

// Multer configuration
const storage = multer.memoryStorage();
const upload = multer({
	storage: storage,
	limits: { fileSize: 2500000 } // 2.5MB file size limit
});

// Upload API endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
	if (!req.file) {
		return res.status(400).send('No file uploaded.');
	}

	if (req.file.size > 2500000) {
		return res.status(400).send('File size exceeds limit (2.5MB).');
	}

	const randomFilename = crypto.randomBytes(5).toString('hex'); // Generate random filename
	const fileExtension = req.file.originalname.split('.').pop(); // Extract file extension
	const sanitizedFilename = randomFilename + '.' + fileExtension; // Combine random string and extension
	const encodedFilename = encodeURIComponent(sanitizedFilename); // Encode filename

	try {
		await octokit.repos.createOrUpdateFileContents({
			owner: 'M1noa',
			repo: 'files',
			path: sanitizedFilename, // Use sanitized filename
			message: 'Upload file',
			content: req.file.buffer.toString('base64')
		});

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

app.get('/api/files', async (req, res) => {
	try {
		const response = await octokit.rest.repos.getContent({
			owner: 'M1noa',
			repo: 'files'
		});

		const files = response.data.map(file => {
			return {
				name: file.name
			};
		});

		res.json(files);
	} catch (error) {
		console.error('Error fetching files from GitHub:', error);
		res.status(500).send('An error occurred');
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
