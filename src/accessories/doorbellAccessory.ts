import { PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';
import { ShomeCameraController } from '../controller/cameraController.js';
import { Visitor } from '../shomeClient.js';

export class DoorbellAccessory {
  private doorbellService: Service;
  private motionService: Service;
  private cameraController: ShomeCameraController;

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'sHome')
          .setCharacteristic(this.platform.Characteristic.Model, 'Doorbell')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, 'shome-doorbell');

        this.doorbellService = this.accessory.getService(this.platform.Service.Doorbell)
            || this.accessory.addService(this.platform.Service.Doorbell);
        this.doorbellService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent);

        this.cameraController = new ShomeCameraController(this.platform, this.accessory);
        this.accessory.configureController(this.cameraController.controller);

        this.motionService = this.accessory.getService(this.platform.Service.MotionSensor)
            || this.accessory.addService(this.platform.Service.MotionSensor, 'Doorbell Motion');

        this.doorbellService.addLinkedService(this.motionService);
  }

  public newVisitor(visitor: Visitor) {
    this.platform.log.info(`New visitor event at [${visitor.deviceLabel}]. Ringing doorbell and updating snapshot data.`);

    this.cameraController.updateVisitor(visitor);

    this.doorbellService.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .updateValue(this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);

    this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(true);
    setTimeout(() => {
      this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(false);
    }, 1000);
  }

  public shutdown() {
    this.cameraController.shutdown();
  }
}
