const winston = require('winston');
const path = require('path');

let recordedConfig = null;

// 1. Mock the DailyRotateFile package
jest.mock('winston-daily-rotate-file', () => {
  // We create a named function 
  function DailyRotateFile(opts) {
    this.filename = opts.filename || '';
    this.maxSize = opts.maxSize || '';
    this.maxFiles = opts.maxFiles || '';
    this.zippedArchive = opts.zippedArchive || false;
  }
  return DailyRotateFile;
});

// 2. Mock Winston
jest.doMock('winston', () => {
    const originalWinston = jest.requireActual('winston');
    return {
        ...originalWinston,
        createLogger: jest.fn(config => {
            recordedConfig = config;
            return {
                info: jest.fn(),
                warn: jest.fn(),
                error: jest.fn(),
            };
        }),
    };
});

jest.resetModules();
require('./logger');

const config = recordedConfig;

describe('Logger Configuration (Upgraded)', () => {

  it('should initialize with info level for full visibility', () => {
    expect(config.level).toBe('info');
  });

  it('should include both Console and DailyRotateFile transports', () => {
    expect(config.transports).toHaveLength(2); 
    
    const transportTypes = config.transports.map(t => t.constructor.name);
    expect(transportTypes).toContain('Console');
    // 💡 Updated to look for the Rotate transport
    expect(transportTypes).toContain('DailyRotateFile');
  });

  it('should configure 60-day history and audit filename correctly', () => {
    const rotateTransport = config.transports.find(t => t.constructor.name === 'DailyRotateFile');

    expect(rotateTransport).toBeDefined();

    // 💡 Check for the NEW filename pattern
    expect(rotateTransport.filename).toMatch(/audit-%DATE%\.log$/);
    
    // 💡 Check for the NEW string-based size and 60d limit
    expect(rotateTransport.maxSize).toBe('5m');
    expect(rotateTransport.maxFiles).toBe('60d');
    expect(rotateTransport.zippedArchive).toBe(true);
  });
});