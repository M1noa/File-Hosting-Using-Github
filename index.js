const express = require('express');
const multer = require('multer');
const { Octokit } = require('@octokit/rest');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

const app = express();
const octokit = new Octokit({ auth: process.env.GITHUB_API_KEY });

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

    if (req.file.size > 100 * 1024 * 1024) { // Check if file size exceeds 100MB
        return res.status(400).send('File size exceeds limit (100MB).');
    }

    const randomFilename = crypto.randomBytes(10).toString('hex'); // Generate random filename
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

// Fetch IPTV sources and combine them into one big M3U file
app.get('/IPTV.m3u', async (req, res) => {
    const filters = (req.query.f || '').split(',').map(filter => filter.trim()).filter(Boolean);
    console.log('Filters applied:', filters);

    console.log('Fetching EPG sources from https://github.com/M1noa/multi-m3u/raw/main/EPG%20sources.txt');
    try {
        // Get the list of IPTV sources
        const sourcesResponse = await axios.get('https://github.com/M1noa/multi-m3u/raw/main/EPG%20sources.txt');
        console.log('Received IPTV sources list.');
        let sources = sourcesResponse.data.split('\n').filter(line => line.trim() !== '');

        // Apply filters to the sources
        if (filters.length > 0) {
            sources = sources.filter(source => !filters.some(filter => source.includes(filter)));
            console.log('Filtered IPTV sources:', sources);
        }

        // Define the concurrency limit
        const concurrencyLimit = 5;
        let combinedM3U = '#EXTM3U\n';
        console.log('Starting to combine M3U sources.');

        for (let i = 0; i < sources.length; i += concurrencyLimit) {
            const currentBatch = sources.slice(i, i + concurrencyLimit);
            console.log(`Fetching batch of ${currentBatch.length} M3U sources.`);
            const fetchPromises = currentBatch.map(async (source, index) => {
                const content = await fetchContentWithRetry(source); // Fetch content with retry logic
                if (content) {
                    console.log(`Combining M3U content from source ${i + index + 1}`);
                    return content;
                } else {
                    console.log(`Skipping M3U source ${i + index + 1} due to failure.`);
                    return ''; // Skip the failed source
                }
            });

            // Wait for the batch of requests to complete
            const results = await Promise.all(fetchPromises);

            // Combine results into the M3U string
            combinedM3U += results.join('\n');
        }

        console.log('All M3U sources combined.');

        res.set('Content-Type', 'application/x-mpegurl');
        res.send(combinedM3U);
        console.log('Sent combined IPTV M3U file.');
    } catch (error) {
        console.error('Error fetching or combining IPTV sources:', error);
        res.status(500).send('An error occurred');
    }
});

// Function to fetch XML source with retry logic
const fetchXmlWithRetry = async (source, attempt = 1) => {
    try {
        console.log(`Fetching XML source: ${source} (Attempt ${attempt})`);
        const response = await axios.get(source);
        console.log(`Fetched XML source: ${source} (Attempt ${attempt})`);
        let xmlContent = response.data;

        // Remove any extra DOCTYPE or XML declaration
        xmlContent = xmlContent.replace(/<!DOCTYPE[^>]*>/i, ''); // Remove DOCTYPE declaration
        xmlContent = xmlContent.replace(/<\?xml[^>]*\?>/, ''); // Remove XML declaration

        return xmlContent.trim(); // Add XML content to the combined XML
    } catch (error) {
        console.error(`Error fetching XML source: ${source} (Attempt ${attempt})`);
        if (attempt < 2) {
            console.log(`Retrying XML source: ${source} (Attempt ${attempt + 1})`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Add delay between retries (1 second)
            return fetchXmlWithRetry(source, attempt + 1);
        } else {
            console.error(`Failed to fetch XML source: ${source} after 2 attempts. Skipping.`);
            return null; // Skip this source
        }
    }
};

// Fetch EPG sources and combine them into one big XML file
app.get('/EPG.xml', async (req, res) => {
    const filters = (req.query.f || '').split(',').map(filter => filter.trim()).filter(Boolean);
    console.log('Filters applied:', filters);

    console.log('Fetching EPG sources from https://github.com/M1noa/multi-m3u/raw/main/EPG%20sources.txt');
    try {
        // Get the list of EPG sources
        const sourcesResponse = await axios.get('https://github.com/M1noa/multi-m3u/raw/main/EPG%20sources.txt');
        console.log('Received EPG sources list.');
        let sources = sourcesResponse.data.split('\n').filter(line => line.trim() !== '');

        // Apply filters to the sources
        if (filters.length > 0) {
            sources = sources.filter(source => !filters.some(filter => source.includes(filter)));
            console.log('Filtered EPG sources:', sources);
        }

        // Define the concurrency limit
        const concurrencyLimit = 5;
        let combinedXml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv>\n';
        console.log('Starting to combine XML sources.');

        for (let i = 0; i < sources.length; i += concurrencyLimit) {
            const currentBatch = sources.slice(i, i + concurrencyLimit);
            console.log(`Fetching batch of ${currentBatch.length} XML sources.`);
            const fetchPromises = currentBatch.map(async (source, index) => {
                const xmlContent = await fetchXmlWithRetry(source); // Fetch XML with retry logic
                if (xmlContent) {
                    console.log(`Combining XML content from source ${i + index + 1}`);
                    return xmlContent;
                } else {
                    console.log(`Skipping XML source ${i + index + 1} due to failure.`);
                    return ''; // Skip the failed source
                }
            });

            // Wait for the batch of requests to complete
            const results = await Promise.all(fetchPromises);

            // Combine results into the XML string
            combinedXml += results.join('');
        }

        combinedXml += '\n</tv>';
        console.log('All XML sources combined.');

        res.set('Content-Type', 'application/xml');
        res.send(combinedXml);
        console.log('Sent combined EPG XML file.');
    } catch (error) {
        console.error('Error fetching or combining EPG sources:', error);
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
