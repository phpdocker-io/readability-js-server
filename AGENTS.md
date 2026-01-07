# AGENTS.md - Readability JS Server

## Project Overview

**Readability JS Server** is an HTTP microservice that wraps Mozilla's Readability.js library to extract clean, readable content from web pages. It provides a simple REST API endpoint that accepts a URL and returns the parsed article content with metadata.

### Purpose
- Extract readable content from web pages
- Remove ads, navigation, and other clutter
- Return structured article data (title, content, excerpt, etc.)
- Deploy as a containerized service

## Architecture

### Technology Stack
- **Runtime**: Node.js 20 (Alpine Linux)
- **Framework**: Express.js 5.x
- **Core Library**: @mozilla/readability 0.6.0
- **DOM Processing**: jsdom 27.4.0
- **Content Sanitization**: DOMPurify 3.3.1
- **HTTP Client**: axios 1.13.2
- **Process Manager**: PM2 (5 instances in production)
- **Logging**: log-timestamp

### Service Architecture
- Single Express application (`src/app.js`)
- One POST endpoint at root (`/`)
- Stateless service (no session/state management)
- Runs multiple PM2 instances for load distribution

## API Specification

### Endpoint
```
POST /
```

### Request Format
**Content-Type**: `application/json`

**Body**:
```json
{
  "url": "https://example.com/article"
}
```

**Required Fields**:
- `url` (string): The URL of the web page to extract content from

### Response Format

**Success Response** (HTTP 200):
```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "byline": "Author Name",
  "dir": "ltr",
  "content": "<div>...sanitized HTML content...</div>",
  "length": 12345,
  "excerpt": "Article excerpt...",
  "siteName": "Site Name"
}
```

**Error Responses**:

- **400 Bad Request**: Invalid or missing URL
  ```json
  {
    "error": "Send JSON, like so: {\"url\": \"https://url/to/whatever\"}"
  }
  ```

- **500 Internal Server Error**: Failed to fetch or parse content
  ```json
  {
    "error": "Some weird error fetching the content",
    "details": { ...error object... }
  }
  ```

### Response Properties
All properties returned match Mozilla's Readability.js parse output:
- `url`: The requested URL (echoed back)
- `title`: Article title
- `byline`: Author information (may be null)
- `dir`: Text direction ("ltr" or "rtl")
- `content`: Sanitized HTML content (allows iframe and video tags for media)
- `length`: Character count of the content
- `excerpt`: Article excerpt/summary
- `siteName`: Site name (may be null)

## Usage Examples

### cURL Example
```bash
curl -XPOST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"url": "https://en.wikipedia.org/wiki/Firefox"}'
```

### JavaScript/Node.js Example
```javascript
const axios = require('axios');

async function extractContent(url) {
  try {
    const response = await axios.post('http://localhost:3000/', {
      url: url
    });
    return response.data;
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    throw error;
  }
}

// Usage
extractContent('https://example.com/article')
  .then(data => {
    console.log('Title:', data.title);
    console.log('Content length:', data.length);
    console.log('Excerpt:', data.excerpt);
  });
```

### Python Example
```python
import requests

def extract_content(url):
    response = requests.post(
        'http://localhost:3000/',
        json={'url': url},
        headers={'Content-Type': 'application/json'}
    )
    response.raise_for_status()
    return response.json()

# Usage
data = extract_content('https://example.com/article')
print(f"Title: {data['title']}")
print(f"Content length: {data['length']}")
print(f"Excerpt: {data['excerpt']}")
```

## Development

### Prerequisites
- Node.js >= 10
- Yarn package manager

### Local Setup
```bash
# Install dependencies
yarn install

# Start development server (with nodemon)
yarn start
```

### Available Commands
- `yarn start`: Start development server with auto-reload
- `yarn prettier -c src/`: Check code formatting
- `yarn prettier -w src/`: Fix code formatting

### Makefile Targets
- `make install`: Install dependencies
- `make start`: Start the server
- `make lint`: Check code formatting
- `make lint-fix`: Fix code formatting
- `make build-container`: Build Docker image
- `make run-container`: Run Docker container
- `make example-request`: Test the API with example request

## Deployment

### Docker

**Image**: `phpdockerio/readability-js-server`

**Supported Architectures**:
- `linux/amd64`
- `linux/arm64`
- `linux/arm/v7` (up to version 1.5.0)

**Versioning**: Uses semantic versioning with tags:
- `latest`: Latest version
- `x.x.x`: Specific version (e.g., `1.7.2`)
- `x.x`: Minor version (e.g., `1.7`)
- `x`: Major version (e.g., `1`)

**Run Container**:
```bash
docker run -p 3000:3000 phpdockerio/readability-js-server
```

**Production Configuration**:
- Runs on port 3000
- Uses PM2 with 5 instances
- Node.js 20 Alpine base image
- Non-root user (`readability`)

### Environment Variables
Currently, no configuration is required. The service runs with defaults:
- Port: 3000
- PM2 instances: 5
- Environment: production (when using Docker)

## Technical Details

### Content Sanitization
- Uses DOMPurify to sanitize fetched HTML
- Allows `iframe` and `video` tags (for YouTube videos and media content)
- Removes potentially dangerous scripts and elements

### Processing Flow
1. Receive POST request with URL
2. Fetch HTML content from URL using axios
3. Sanitize HTML with DOMPurify
4. Parse HTML with jsdom
5. Extract readable content with Readability.js
6. Return structured JSON response

### Error Handling
- Validates URL presence in request body
- Handles HTTP fetch errors
- Handles parsing errors
- Returns appropriate HTTP status codes

### Logging
- Uses `log-timestamp` for timestamped console logs
- Logs fetch operations and success/failure
- Logs server startup with version information

## Limitations & Considerations

1. **No Authentication**: The service has no built-in authentication or rate limiting
2. **Single Endpoint**: Only one endpoint (`POST /`) is available
3. **No Caching**: Each request fetches content fresh from the source
4. **Content Sanitization**: Allows iframes and videos, which may have security implications
5. **Error Messages**: Generic error messages may not provide detailed debugging information
6. **No Configuration**: Hardcoded port (3000) and PM2 instances (5)

## Integration Guidelines for AI Agents

### When to Use This Service
- Extract readable content from web pages
- Remove navigation, ads, and boilerplate
- Get structured article metadata
- Process web content for analysis or storage

### Best Practices
1. **Error Handling**: Always handle HTTP errors and check response status
2. **URL Validation**: Validate URLs before sending requests
3. **Timeout Handling**: Implement request timeouts for reliability
4. **Rate Limiting**: Implement client-side rate limiting if needed
5. **Content Validation**: Verify response structure before processing

### Common Use Cases
- Content aggregation services
- Article readers and parsers
- Content analysis tools
- Web scraping pipelines
- RSS feed enhancement

## Version Information

Current version: **1.7.2**

Version is stored in the `release` file and displayed on server startup.

## License

Apache-2.0

## Repository

https://github.com/phpdocker-io/readability-js-server

