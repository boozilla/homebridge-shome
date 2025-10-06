import { PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';
import { ParkingEvent } from '../shomeClient.js';

export class ParkingAccessory {
  private motionService: Service;

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'sHome')
          .setCharacteristic(this.platform.Characteristic.Model, 'Parking Sensor')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, 'shome-parking-sensor');

        this.motionService = this.accessory.getService(this.platform.Service.MotionSensor)
            || this.accessory.addService(this.platform.Service.MotionSensor, 'Parking Activity');
  }

  public newParkingEvent(event: ParkingEvent) {
    this.platform.log.info(`New parking event for car ${event.car_no}: ${event.unit} at ${event.park_date}`);

    this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(true);
    setTimeout(() => {
      this.motionService.getCharacteristic(this.platform.Characteristic.MotionDetected).updateValue(false);
    }, 5000);
  }
}
