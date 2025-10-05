import { PlatformAccessory, Service } from 'homebridge';
import { ShomePlatform } from '../platform.js';

export class DoorbellAccessory {
  private service: Service;

  constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
  ) {

        // set accessory information
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, 'sHome')
          .setCharacteristic(this.platform.Characteristic.Model, 'sHome Doorbell')
          .setCharacteristic(this.platform.Characteristic.SerialNumber, 'shome-doorbell');
        this.service = this.accessory.getService(this.platform.Service.StatelessProgrammableSwitch)
            || this.accessory.addService(this.platform.Service.StatelessProgrammableSwitch);
        this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.displayName);
        this.service.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent);
  }

  public ring(visitorLabel: string) {
    this.platform.log.info(`Triggered Doorbell event from [${visitorLabel}]`);

    this.service.getCharacteristic(this.platform.Characteristic.ProgrammableSwitchEvent)
      .updateValue(this.platform.Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
  }
}
