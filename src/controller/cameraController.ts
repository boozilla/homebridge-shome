import {
  CameraController,
  CameraStreamingDelegate,
  HAP,
  H264Level,
  H264Profile,
  Logger,
  PlatformAccessory,
  PrepareStreamCallback,
  PrepareStreamRequest,
  PrepareStreamResponse,
  SnapshotRequest,
  SnapshotRequestCallback,
  StartStreamRequest,
  StreamRequestCallback,
  StreamRequestTypes,
  StreamingRequest,
} from 'homebridge';
import { ShomePlatform } from '../platform.js';
import { Visitor } from '../shomeClient.js';
import { spawn } from 'child_process';
import { randomBytes } from 'crypto';

// prepareStream 단계에서 보류중인 세션 정보를 저장하기 위한 타입
type PendingSession = {
    address: string; // address of the HAP controller
    addressVersion: 'ipv4' | 'ipv6';

    videoPort: number;
    videoSSRC: number;

    videoSRTPKey: Buffer;
    videoSRTPSalt: Buffer;
};

// 현재 진행중인 스트리밍 세션 정보를 저장하기 위한 타입
type OngoingSession = {
    ffmpeg: ReturnType<typeof spawn>;
    timeout?: NodeJS.Timeout;
};

export class ShomeCameraController implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly log: Logger;
  private latestVisitor: Visitor | null = null;
  public readonly controller: CameraController;
  private cachedSnapshot: Buffer | null = null;

  private readonly pendingSessions: Record<string, PendingSession> = {};
  private readonly ongoingSessions: Record<string, OngoingSession> = {};

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
    this.hap = this.platform.api.hap;
    this.log = this.platform.log;

    this.controller = new this.hap.CameraController({
      cameraStreamCount: 2,
      delegate: this,
      streamingOptions: {
        supportedCryptoSuites: [this.hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: [
            [1280, 720, 30], // width, height, fps
            [1024, 576, 30],
            [640, 360, 30],
            [480, 270, 30],
            [320, 240, 30],
            [320, 180, 30],
          ],
          codec: {
            profiles: [H264Profile.BASELINE, H264Profile.MAIN, H264Profile.HIGH],
            levels: [H264Level.LEVEL3_1, H264Level.LEVEL3_2, H264Level.LEVEL4_0],
          },
        },
      },
    });

    let cameraOperatingMode = this.accessory.getService(this.platform.Service.CameraOperatingMode);
    if (!cameraOperatingMode) {
      cameraOperatingMode = this.accessory.addService(this.platform.Service.CameraOperatingMode, this.accessory.displayName + ' Mode');
    }
    cameraOperatingMode.setCharacteristic(this.hap.Characteristic.EventSnapshotsActive, this.hap.Characteristic.EventSnapshotsActive.ENABLE);

    if (!this.accessory.getService(this.platform.Service.CameraRTPStreamManagement)) {
      this.accessory.addService(this.platform.Service.CameraRTPStreamManagement, this.accessory.displayName + ' Stream Management');
    }
  }

  public async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    this.log.debug('Handling snapshot request...');

    if (this.cachedSnapshot) {
      this.log.debug('Returning cached snapshot.');
      return callback(undefined, this.cachedSnapshot);
    }

    if (!this.latestVisitor) {
      this.log.debug('No visitor data available for snapshot. This will result in a "No Response" error until the first doorbell event.');
      return callback(new Error('No snapshot available'));
    }

    try {
      const imageBuffer = await this.platform.shomeClient.getThumbnailImage(this.latestVisitor);

      if (imageBuffer) {
        this.log.info('Snapshot fetched successfully via shomeClient.');
        this.cachedSnapshot = imageBuffer;
        callback(undefined, imageBuffer);
      } else {
        throw new Error('Failed to retrieve image buffer from shomeClient.');
      }
    } catch (error) {
      this.log.error('Failed to get snapshot:', error);
      callback(error as Error);
    }
  }

  public updateVisitor(visitor: Visitor) {
    this.log.debug(`Updating latest visitor data for sttId: ${visitor.sttId}`);
    this.latestVisitor = visitor;
    this.cachedSnapshot = null;
  }

  async prepareStream(request: PrepareStreamRequest, callback: PrepareStreamCallback): Promise<void> {
    const sessionId = request.sessionID; // Use the session ID from the request
    const videoSSRC = this.hap.CameraController.generateSynchronisationSource();

    // SRTP 키와 솔트 생성
    const srtpKey = randomBytes(16);
    const srtpSalt = randomBytes(14);

    const sessionInfo: PendingSession = {
      address: request.targetAddress,
      addressVersion: request.addressVersion,
      videoPort: request.video.port,
      videoSSRC: videoSSRC,
      videoSRTPKey: srtpKey,
      videoSRTPSalt: srtpSalt,
    };

    this.pendingSessions[sessionId] = sessionInfo;

    const response: PrepareStreamResponse = {
      video: {
        port: sessionInfo.videoPort,
        ssrc: sessionInfo.videoSSRC,
        srtp_key: sessionInfo.videoSRTPKey,
        srtp_salt: sessionInfo.videoSRTPSalt,
      },
    };

    callback(undefined, response);
  }

  private async startStream(request: StartStreamRequest, callback: StreamRequestCallback): Promise<void> {
    const sessionId = request.sessionID;
    const sessionInfo = this.pendingSessions[sessionId];
    if (!sessionInfo) {
      this.log.error(`Failed to start stream for session ${sessionId}: session not found.`);
      return callback(new Error('session not found'));
    }

    if (!this.latestVisitor) {
      this.log.warn('No visitor data available for streaming.');
      return callback(new Error('No visitor data'));
    }

    this.log.info(`Starting thumbnail video stream for session ${sessionId}...`);

    let imageBuffer: Buffer | null = null;
    try {
      imageBuffer = await this.platform.shomeClient.getThumbnailImage(this.latestVisitor);
      this.log.debug('Fetched visitor thumbnail successfully.');
    } catch (error) {
      this.log.error('Failed to fetch thumbnail for streaming.', error);
      return callback(error as Error);
    }

    if (!imageBuffer) {
      this.log.error('No valid image buffer available for streaming.');
      return callback(new Error('no image buffer'));
    }

    const { width, height, fps, max_bit_rate: bitrate } = request.video;
    const { address, videoPort: port, videoSSRC, videoSRTPKey, videoSRTPSalt } = sessionInfo;

    const payloadType = 99;

    // HomeKit은 key + salt 를 Base64로 합친 30바이트 키를 요구함.
    const srtpCombinedKey = Buffer.concat([videoSRTPKey, videoSRTPSalt]).toString('base64');

    const ffmpegCommand = [
      '-hide_banner',
      '-loglevel', 'error',
      '-re',
      '-f', 'image2pipe',
      '-loop', '1',
      '-i', 'pipe:0',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-s', `${width}x${height}`,
      '-r', fps.toString(),
      '-b:v', `${bitrate}k`,
      '-bufsize', `${2 * bitrate}k`,
      '-maxrate', `${bitrate}k`,
      '-pix_fmt', 'yuv420p',
      '-an',
      '-payload_type', payloadType.toString(),
      '-ssrc', videoSSRC.toString(),
      '-f', 'rtp',
      '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
      '-srtp_out_params', srtpCombinedKey,
      `srtp://${address}:${port}?pkt_size=1316`,
    ];

    this.log.debug(`Spawn ffmpeg: ffmpeg ${ffmpegCommand.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegCommand, { env: process.env });

    ffmpeg.stdin.write(imageBuffer);
    ffmpeg.stdin.end();

    ffmpeg.stderr.on('data', (data) => {
      this.log.debug(`[FFMPEG ${sessionId}] ${data.toString().trim()}`);
    });

    const timeout = setTimeout(() => {
      this.log.info(`Stream timeout reached (30s) for session ${sessionId}.`);
      ffmpeg.kill('SIGKILL');
    }, 30000);

    ffmpeg.on('exit', (code, signal) => {
      this.log.info(`FFMPEG session ${sessionId} exited (code=${code}, signal=${signal}).`);
      if (timeout) {
        clearTimeout(timeout);
      }
      delete this.ongoingSessions[sessionId];
    });

    ffmpeg.on('error', (error) => {
      this.log.error(`FFMPEG error on session ${sessionId}:`, error);
      if (timeout) {
        clearTimeout(timeout);
      }
      delete this.ongoingSessions[sessionId];
    });

    this.ongoingSessions[sessionId] = { ffmpeg, timeout };
    delete this.pendingSessions[sessionId];
    callback();
  }


  async handleStreamRequest(request: StreamingRequest, callback: StreamRequestCallback): Promise<void> {
    const sessionId = request.sessionID;

    switch (request.type) {
    case StreamRequestTypes.START: {
      this.startStream(request, callback);
      break;
    }

    case StreamRequestTypes.RECONFIGURE:
      this.log.debug(`Received reconfigure request for session ${sessionId}. Ignoring.`);
      callback();
      break;

    case StreamRequestTypes.STOP: {
      this.log.info(`Stopping video stream for session ${sessionId}.`);
      const session = this.ongoingSessions[sessionId];
      if (session) {
        if (session.timeout) {
          clearTimeout(session.timeout);
        }
        session.ffmpeg.kill('SIGKILL');
      } else {
        this.log.warn(`Could not find ongoing session ${sessionId} to stop.`);
      }
      delete this.ongoingSessions[sessionId];
      callback();
      break;
    }
    }
  }

  public shutdown(): void {
    this.log.info('Shutting down all active streaming sessions.');
    for (const sessionId in this.ongoingSessions) {
      const session = this.ongoingSessions[sessionId];
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
      session.ffmpeg.kill('SIGKILL');
    }
    // Clear all sessions
    for (const prop of Object.keys(this.pendingSessions)) {
      delete this.pendingSessions[prop];
    }
    for (const prop of Object.keys(this.ongoingSessions)) {
      delete this.ongoingSessions[prop];
    }
  }
}
