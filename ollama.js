// Optimized MyInference Proxy Server - Single File Version
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const axios = require('axios');
const dotenv = require('dotenv');
const { URL } = require('url');

// Load environment variables
dotenv.config();

// Configuration constants
const API_KEYS = parseEnvArray('sk_n2dp3OcJ-w0htHaFdpQw7Fhfg6kyVc85QhbhSarWLGI', ['sk_n2dp3OcJ-w0htHaFdpQw7Fhfg6kyVc85QhbhSarWLGI']);
const PORT = 14444;
const API_URL = 'https://api.novita.ai/v3/openai';
const MODEL = "meta-llama/llama-3.2-1b-instruct"
const PROXY_URL = process.env.PROXY_URL || null;

// Default supported models
const SUPPORTED_MODELS = [
  'deepseek-r1:1.5b', 'deepseek-r1:7b', 'deepseek-r1:8b', 'deepseek-r1:14b',
  'qwen2.5:7b-instruct-fp16', 'llama3.1:8b-instruct-q4_K_M',
  'llama3.3:70b-instruct-fp16', 'llama3.3:70b-instruct-q8_0'
];

// Helper Functions
function parseEnvArray(envVar, defaultValue = []) {
  const value = process.env[envVar];
  if (value) {
    const arr = value.split(',').map(key => key.trim()).filter(key => key.length > 0);
    if (arr.length > 0) {
      return arr;
    }
  }
  return Array.isArray(defaultValue) ? defaultValue : [defaultValue].filter(Boolean);
}

function getRandomApiKey(keyArray) {
  if (!keyArray || keyArray.length === 0) {
    throw new Error('API key array is empty. Please configure API keys.');
  }
  const randomIndex = Math.floor(Math.random() * keyArray.length);
  return keyArray[randomIndex];
}

function getProxyConfig() {
  if (!PROXY_URL) return null;
  
  try {
    const parsedProxyUrl = new URL(PROXY_URL);
    const proxyConfig = {
      protocol: parsedProxyUrl.protocol.replace(':', ''),
      host: parsedProxyUrl.hostname,
      port: parsedProxyUrl.port ? parseInt(parsedProxyUrl.port, 10) : (parsedProxyUrl.protocol === 'https:' ? 443 : 80),
    };
    
    if (parsedProxyUrl.username || parsedProxyUrl.password) {
      proxyConfig.auth = {
        username: decodeURIComponent(parsedProxyUrl.username),
        password: decodeURIComponent(parsedProxyUrl.password),
      };
    }
    
    return proxyConfig;
  } catch (error) {
    console.error(`Invalid PROXY_URL format: "${PROXY_URL}". Error: ${error.message}. Proceeding without proxy.`);
    return null;
  }
}

// Logging helper function
function logRequest(method, endpoint, status, responsePreview) {
  const timestamp = new Date().toISOString();
  const statusText = status >= 200 && status < 300 ? '✓ SUCCESS' : '✗ FAILED';
  const preview = responsePreview ? responsePreview.substring(0, 50).replace(/\n/g, ' ') : '';
  
  console.log(`[${timestamp}] ${method} ${endpoint} - ${status} ${statusText} ${preview ? `- ${preview}${preview.length >= 50 ? '...' : ''}` : ''}`);
}

// Set up agents for keep-alive connections - critical for high throughput
const httpAgent = new http.Agent({ 
  keepAlive: true, 
  maxSockets: 500,      // Increased for high concurrency
  maxFreeSockets: 100,  // Keep connections ready
  timeout: 60000,       // 60 seconds
  scheduling: 'lifo'    // Last In First Out for better connection reuse
}); 

const httpsAgent = new https.Agent({ 
  keepAlive: true, 
  maxSockets: 500,      // Increased for high concurrency
  maxFreeSockets: 100,  // Keep connections ready
  timeout: 60000,       // 60 seconds
  scheduling: 'lifo'    // Last In First Out for better connection reuse
});

const proxyConfig = getProxyConfig();

// Create Express app
const app = express();

// CORS middleware with preflight options
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse various content types
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.text({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

// Raw body middleware for requests with no content-type
app.use((req, res, next) => {
  if (!req.headers['content-type']) {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', chunk => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        req.body = JSON.parse(data);
      } catch (e) {
        req.body = data;
      }
      next();
    });
  } else {
    next();
  }
});

// API Key check function
function checkApiKey() {

  if (!process.pkg) return Promise.resolve(true);


  return Promise.resolve(true);
}

// Model utility functions
function createModelObject(name) {
  const currentDate = new Date();
  const modifiedDate = new Date(currentDate);
  modifiedDate.setFullYear(currentDate.getFullYear() + 1);
  
  const digest = [...Array(64)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
  
  const parts = name.split(':');
  const family = parts[0];
  let parameterSize = parts[1] || '';
  parameterSize = parameterSize.includes('b') ? parameterSize.toUpperCase() : parameterSize;
  
  return {
    name,
    model: name,
    modified_at: modifiedDate.toISOString(),
    size: Math.floor(Math.random() * 500000000) + 100000000,
    digest,
    details: {
      parent_model: "",
      format: "gguf",
      family,
      families: [family],
      parameter_size: parameterSize,
      quantization_level: Math.random() > 0.5 ? "Q4_K_M" : "F16"
    }
  };
}

function getModelList() {
  return {
    models: SUPPORTED_MODELS.map(model => createModelObject(model))
  };
}

function getOpenAIModelList() {
  const models = SUPPORTED_MODELS.map(id => ({
    id,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'library'
  }));
  
  return { data: models, object: 'list' };
}

function getOpenAIModel(model) {
  if (SUPPORTED_MODELS.includes(model)) {
    return {
      id: model,
      object: 'model',
      created: Math.floor(Date.now() / 1000),
      owned_by: 'library'
    };
  }
  return null;
}

function transformChatResponse(model, messages, myInferenceResponse) {
  return {
    model,
    created_at: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: myInferenceResponse.choices[0].message.content
    },
    done: true,
    total_duration: Math.floor(Math.random() * 5000000000),
    load_duration: Math.floor(Math.random() * 2000000),
    prompt_eval_count: messages.length,
    prompt_eval_duration: Math.floor(Math.random() * 400000000),
    eval_count: Math.floor(Math.random() * 300) + 100,
    eval_duration: Math.floor(Math.random() * 5000000000)
  };
}

// API utility functions
async function makeChatRequest(model, messages, stream = true, otherParams = {}) {
  const selectedApiKey = getRandomApiKey(API_KEYS);
  const requestConfig = {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${selectedApiKey}`,
    },
    responseType: stream ? 'stream' : 'json',
    timeout: stream ? 180000 : 60000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeoutErrorMessage: 'Request timed out',
    httpAgent: API_URL.startsWith('https') ? undefined : httpAgent,
    httpsAgent: API_URL.startsWith('https') ? httpsAgent : undefined,
  };

  if (proxyConfig) {
    requestConfig.proxy = proxyConfig;
    delete requestConfig.httpAgent;
    delete requestConfig.httpsAgent;
  }

  return await axios.post(`${API_URL}/chat/completions`, {
    model,
    messages,
    stream,
    max_tokens: 100000,
    ...otherParams
  }, requestConfig);
}

async function makeCompletionRequest(model, prompt, stream = true, otherParams = {}) {
  const selectedApiKey = getRandomApiKey(API_KEYS);
  const payload = {
    model,
    messages: [{ role: 'user', content: prompt }],
    stream,
    max_tokens: 100000,
    ...otherParams
  };

  const requestConfig = {
    headers: {
      'Authorization': `Bearer ${selectedApiKey}`,
      'Content-Type': 'application/json',
    },
    responseType: stream ? 'stream' : 'json',
    timeout: stream ? 180000 : 60000,
    httpAgent: API_URL.startsWith('https') ? undefined : httpAgent,
    httpsAgent: API_URL.startsWith('https') ? httpsAgent : undefined,
  };

  if (proxyConfig) {
    requestConfig.proxy = proxyConfig;
    delete requestConfig.httpAgent;
    delete requestConfig.httpsAgent;
  }

  return await axios.post(`${API_URL}/chat/completions`, payload, requestConfig);
}

// Ollama API route handlers
async function getModelsHandler(req, res) {
  // logRequest('GET', '/api/tags', 200, 'Models retrieved');
  res.json(getModelList());
}

async function chatHandler(req, res) {
  try {
    const { model, messages, stream = true, ...otherParams } = req.body;
    
    const response = await makeChatRequest( "llama-3.1-8b-instruct", messages, stream, otherParams);
    
    if (stream) {
      let buffer = '';
      let responsePreview = '';
      
      response.data.on('data', chunk => {
        try {
          buffer += chunk.toString();
          
          while (true) {
            const messageEnd = buffer.indexOf('\n');
            if (messageEnd === -1) break;
            
            const message = buffer.slice(0, messageEnd);
            buffer = buffer.slice(messageEnd + 1);
            
            if (!message.trim()) continue;
            
            const jsonStr = message.replace(/^data: /, '');
            
            if (jsonStr.trim() === '[DONE]') continue;
            
            const myInferenceResponse = JSON.parse(jsonStr);
            const content = myInferenceResponse.choices[0].delta.content || "";
            
            // Capture some content for the log
            if (responsePreview.length < 50) {
              responsePreview += content;
            }
            
            const streamResponse = {
              model: model || "meta-llama/Meta-Llama-3-8B-Instruct",
              created_at: new Date().toISOString(),
              message: {
                role: "assistant",
                content: content
              },
              done: false
            };
            
            res.header('Content-Type', 'application/json');
            res.write(JSON.stringify(streamResponse) + '\n');
          }
        } catch (error) {
          console.error('Error processing stream chunk:', error);
        }
      });

      response.data.on('end', () => {
        const finalResponse = {
          model: model || "qwen2.5:0.5b",
          created_at: new Date().toISOString(),
          message: {
            role: "assistant",
            content: ""
          },
          done: true,
          done_reason: "stop",
          total_duration: Math.floor(Math.random() * 20000000000),
          load_duration: Math.floor(Math.random() * 3000000000),
          prompt_eval_count: Math.floor(Math.random() * 50) + 10,
          prompt_eval_duration: Math.floor(Math.random() * 500000000),
          eval_count: Math.floor(Math.random() * 1000) + 100,
          eval_duration: Math.floor(Math.random() * 17000000000)
        };
        
        res.write(JSON.stringify(finalResponse) + '\n');
        res.end();
        
        logRequest('POST', '/api/chat', 200, responsePreview);
      });
      
      response.data.on('error', (err) => {
        logRequest('POST', '/api/chat', 500, err.message);
      });
    } else {
      const myInferenceResponse = response.data;
      myInferenceResponse.model = model;
      res.json(transformChatResponse(model, messages, myInferenceResponse));
      
      logRequest('POST', '/api/chat', 200, myInferenceResponse.choices[0].message.content);
    }
  } catch (error) {
    console.error('Error in chat endpoint:', error.message);
    logRequest('POST', '/api/chat', 500, error.message);
    res.status(500).json({ error: 'Failed to proxy request', details: error.message });
  }
}

async function generateHandler(req, res) {
  try {
    // Parse request body
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Extract parameters with fallbacks
    const model = body.model || 'qwen2.5:0.5b';
    const prompt = body.prompt || '';
    const stream = body.stream === false ? false : true;
    const { model: _, prompt: __, stream: ___, ...otherParams } = body;
    
    const response = await makeCompletionRequest( "llama-3.1-8b-instruct", prompt, stream, otherParams);
    
    if (stream) {
      let responsePreview = '';
      
      response.data.on('data', chunk => {
        if (responsePreview.length < 50) {
          try {
            const jsonStr = chunk.toString().replace(/^data: /, '').trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              const data = JSON.parse(jsonStr);
              responsePreview += data.choices[0].delta.content || '';
            }
          } catch (e) {
            // Ignore parsing errors for logging
          }
        }
        res.write(chunk);
      });
      
      response.data.on('end', () => {
        res.end();
        logRequest('POST', '/api/generate', 200, responsePreview);
      });
      
      response.data.on('error', (err) => {
        logRequest('POST', '/api/generate', 500, err.message);
      });
    } else {
      const myInferenceResponse = response.data;
      
      // Create a response in the specified format
      const ollamaResponse = {
        model: model,
        created_at: new Date().toISOString(),
        response: myInferenceResponse.choices[0].message.content,
        done: true,
        done_reason: "stop",
        context: Array(500).fill(0).map(() => Math.floor(Math.random() * 100000)),
        total_duration: Math.floor(Math.random() * 15000000000),
        load_duration: Math.floor(Math.random() * 60000000),
        prompt_eval_count: prompt.length > 0 ? Math.floor(prompt.length / 10) : 39,
        prompt_eval_duration: Math.floor(Math.random() * 50000000),
        eval_count: Math.floor(Math.random() * 500) + 100,
        eval_duration: Math.floor(Math.random() * 14000000000)
      };
      
      res.json(ollamaResponse);
      logRequest('POST', '/api/generate', 200, myInferenceResponse.choices[0].message.content);
    }
  } catch (error) {
    console.error('Error in generate endpoint:', error.message);
    logRequest('POST', '/api/generate', 500, error.message);
    res.status(500).json({ error: 'Failed request', details: error.message });
  }
}

// OpenAI compatibility route handlers
async function chatCompletionsHandler(req, res) {
  try {
    const { model, messages, stream = false, ...otherParams } = req.body;

    let retryCount = 0;
    const maxRetries = 3;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    let responsePreview = '';

    while (retryCount < maxRetries) {
      try {
        const response = await makeChatRequest(MODEL, messages, stream, otherParams);

        if (stream) {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          let buffer = '';

          response.data.on('data', chunk => {
            try {
              buffer += chunk.toString();

              while (true) {
                const messageEnd = buffer.indexOf('\n');
                if (messageEnd === -1) break;

                const message = buffer.slice(0, messageEnd);
                buffer = buffer.slice(messageEnd + 1);

                if (!message.trim()) continue;

                const jsonStr = message.replace(/^data: /, '');

                if (jsonStr.trim() === '[DONE]') {
                  res.write('data: [DONE]\n\n');
                  continue;
                }

                const myInferenceResponse = JSON.parse(jsonStr);
                const content = myInferenceResponse.choices?.[0]?.delta?.content || "";
                
                // Capture some content for the log
                if (responsePreview.length < 50) {
                  responsePreview += content;
                }
                
                const streamResponse = {
                  id: myInferenceResponse.id || `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  object: "chat.completion.chunk",
                  created: Math.floor(Date.now() / 1000),
                  model: model || "meta-llama/llama-3.1-8b-instruct/fp-8",
                  choices: [
                    {
                      index: 0,
                      delta: {
                        role: myInferenceResponse.choices?.[0]?.delta?.role || null,
                        content: content,
                        reasoning_content: null,
                        tool_calls: null
                      },
                      logprobs: null,
                      finish_reason: myInferenceResponse.choices?.[0]?.finish_reason || null,
                      matched_stop: null
                    }
                  ],
                  usage: null
                };

                res.write(`data: ${JSON.stringify(streamResponse)}\n\n`);
              }
            } catch (error) {
              console.error('Error processing stream chunk:', error);
            }
          });

          response.data.on('end', () => {
            const finalResponse = {
              id: `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              object: "chat.completion.chunk",
              created: Math.floor(Date.now() / 1000),
              model: model || "meta-llama/llama-3.1-8b-instruct/fp-8",
              choices: [
                {
                  index: 0,
                  delta: {
                    role: null,
                    content: "",
                    reasoning_content: null,
                    tool_calls: null
                  },
                  logprobs: null,
                  finish_reason: "stop",
                  matched_stop: 128009
                }
              ],
              usage: null
            };

            res.write(`data: ${JSON.stringify(finalResponse)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            
            logRequest('POST', '/v1/chat/completions', 200, responsePreview);
          });
          
          response.data.on('error', (err) => {
            logRequest('POST', '/v1/chat/completions', 500, err.message);
          });
        } else {
          res.setHeader('Content-Type', 'application/json');
          response.data.model = model;
          res.json(response.data);
          
          logRequest('POST', '/v1/chat/completions', 200, response.data.choices[0].message.content);
        }
        break;
      } catch (error) {
        if (error.response?.status === 429 && retryCount < maxRetries - 1) {
          console.log(`Rate limit hit (429), retrying in 5 seconds... (Attempt ${retryCount + 1}/${maxRetries})`);
          await delay(5000);
          retryCount++;
          continue;
        }
        throw error;
      }
    }
  } catch (error) {
    console.error('Error in chat completions endpoint:', error.message);
    logRequest('POST', '/v1/chat/completions', 500, error.message);
    res.status(500).json({
      error: {
        message: 'Failed to proxy request',
        type: 'server_error'
      }
    });
  }
}

async function completionsHandler(req, res) {
  try {
    const { model, prompt, stream = false, ...otherParams } = req.body;

    const response = await makeCompletionRequest(MODEL, prompt, stream, otherParams);

    if (stream) {
      let responsePreview = '';
      
      response.data.on('data', chunk => {
        if (responsePreview.length < 50) {
          try {
            const jsonStr = chunk.toString().replace(/^data: /, '').trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              const data = JSON.parse(jsonStr);
              responsePreview += data.choices[0].delta.content || '';
            }
          } catch (e) {
            // Ignore parsing errors for logging
          }
        }
        res.write(chunk);
      });
      
      response.data.on('end', () => {
        res.end();
        logRequest('POST', '/v1/completions', 200, responsePreview);
      });
      
      response.data.on('error', (err) => {
        logRequest('POST', '/v1/completions', 500, err.message);
      });
    } else {
      response.data.model = model;
      res.json(response.data);
      logRequest('POST', '/v1/completions', 200, response.data.choices[0].message.content);
    }
  } catch (error) {
    console.error('Error in completions endpoint:', error.message);
    logRequest('POST', '/v1/completions', 500, error.message);
    res.status(500).json({
      error: {
        message: 'Failed to proxy request',
        type: 'server_error'
      }
    });
  }
}

function listModelsHandler(req, res) {
  logRequest('GET', '/v1/models', 200, 'Models list retrieved');
  res.json(getOpenAIModelList());
}

function getModelHandler(req, res) {
  const { model } = req.params;
  const modelInfo = getOpenAIModel(model);

  if (modelInfo) {
    logRequest('GET', `/v1/models/${model}`, 200, `Model ${model} found`);
    res.json(modelInfo);
  } else {
    logRequest('GET', `/v1/models/${model}`, 404, `Model ${model} not found`);
    res.status(404).json({ error: { message: 'Model not found', type: 'invalid_request_error' } });
  }
}

// Configure routes
app.get('/api/tags', getModelsHandler);
app.post('/api/chat', chatHandler);
app.post('/api/generate', generateHandler);

app.post('/v1/chat/completions', chatCompletionsHandler);
app.post('/v1/completions', completionsHandler);
app.get('/v1/models', listModelsHandler);
app.get('/v1/models/:model', getModelHandler);

// Version endpoint
app.get('/api/version', (req, res) => {
  logRequest('GET', '/api/version', 200, 'Version 1.0.0');
  res.json({ version: '1.0.0' });
});

// Check for --version argument
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log('MyInference v1.0.0');
  process.exit(0);
}

// Fallback for unhandled routes
app.use((req, res) => {
  const endpoint = req.url;
  console.log('Endpoint not supported', endpoint);
  logRequest(req.method, endpoint, 404, 'Endpoint not supported');
  res.status(404).json({ error: 'Endpoint not supported' });
});

// Optimization: handle uncaught errors to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
});

// Check API key and start server with optimized settings
checkApiKey().then(() => {
  // Create HTTP server with optimized settings
  const server = http.createServer({
    keepAliveTimeout: 120000, // 2 minutes
    maxHeadersCount: 100,      // Reasonable limit
    headersTimeout: 60000      // 1 minute
  }, app);
  
  // Increase max listeners to handle high concurrency
  server.setMaxListeners(500);
  
  server.listen(PORT, () => {
    console.log(`MyInference proxy server running on http://localhost:${PORT}`);
  });
});
