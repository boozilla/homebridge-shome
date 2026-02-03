# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

homebridge-shome is a Homebridge plugin that integrates Samsung Smart Home (sHome) platform devices into Apple HomeKit. TypeScript-based ES Module project.

## Build Commands

```bash
npm run build        # Clean dist folder and compile TypeScript
npm run lint         # Run ESLint (zero warnings required)
npm run watch        # Build + npm link + nodemon for development
```

## Architecture

### Core Components

- **ShomePlatform** (`src/platform.ts`): DynamicPlatformPlugin implementation. Handles device discovery, polling loop, and event monitoring
- **ShomeClient** (`src/shomeClient.ts`): sHome API client with JWT authentication, request queue system, and retry logic
- **Accessories** (`src/accessories/`): HomeKit service bindings for each device type

### Device Categories

**Multi-device types** (have sub-devices): LIGHT, HEATER, VENTILATOR
**Single-device types**: DOORLOCK, DOORBELL (virtual), PARKING (virtual), MAINTENANCE_FEE (virtual)

### Polling System

- Uses `setTimeout` for cycle management (not setInterval)
- `isPolling` flag prevents overlapping cycles
- Default 3000ms interval, can be disabled via config
- Polling tasks: device states, visitor events, parking events, maintenance fees

### API Request Queue

- `putQueue` processes device control commands sequentially
- 300ms delay between requests (`REQUEST_DELAY_MS`)
- `pendingPutRequests` tracking skips polling updates during control

### Event Initialization Pattern

Parking and maintenance fee accessories use `isInitializing` flag:
- First run sets baseline
- Prevents false notifications on startup

### Camera Streaming

`ShomeCameraController` converts doorbell thumbnails to H.264 RTP streams via FFmpeg. Max 2 concurrent streams, 30-second timeout.

## Code Style

- Single quotes, 2-space indentation, semicolons required
- Unix line endings
- Max line length 160 characters
- TypeScript strict mode enabled
