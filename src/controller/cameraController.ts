import {
  CameraController,
  CameraStreamingDelegate,
  HAP,
  H264Profile,
  H264Level,
  Logger,
  PlatformAccessory,
  SnapshotRequest,
  SnapshotRequestCallback,
} from 'homebridge';
import { ShomePlatform } from '../platform.js';
import { Visitor } from '../shomeClient.js';

export class ShomeCameraController implements CameraStreamingDelegate {
  private readonly hap: HAP;
  private readonly log: Logger;
  private latestVisitor: Visitor | null = null;
  public readonly controller: CameraController;
  private cachedSnapshot: Buffer | null = null;

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
            [1280, 720, 30],
            [320, 240, 30],
          ],
          codec: {
            profiles: [H264Profile.BASELINE],
            levels: [H264Level.LEVEL3_1],
          },
        },
      },
    });

    let cameraOperatingMode = this.accessory.getService(this.hap.Service.CameraOperatingMode);
    if (!cameraOperatingMode) {
      cameraOperatingMode = this.accessory.addService(this.hap.Service.CameraOperatingMode, this.accessory.displayName + ' Mode');
    }
    cameraOperatingMode.setCharacteristic(this.hap.Characteristic.EventSnapshotsActive, this.hap.Characteristic.EventSnapshotsActive.ENABLE);

    if (!this.accessory.getService(this.hap.Service.CameraRTPStreamManagement)) {
      this.accessory.addService(this.hap.Service.CameraRTPStreamManagement, this.accessory.displayName + ' Stream Management');
    }
  }

  public async handleSnapshotRequest(request: SnapshotRequest, callback: SnapshotRequestCallback): Promise<void> {
    this.log.info('Handling snapshot request...');

    if (this.cachedSnapshot) {
      this.log.info('Returning cached snapshot.');
      return callback(undefined, this.cachedSnapshot);
    }

    if (!this.latestVisitor) {
      this.log.warn('No visitor data available for snapshot. This will result in a "No Response" error until the first doorbell event.');
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

  prepareStream(): Promise<void> {
    return Promise.resolve();
  }

  handleStreamRequest(): void {
    // Streaming not supported
  }
}
