import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';
import {ShomePlatform} from '../platform.js';

export class DoorlockAccessory {
    private service: Service;

    constructor(
        private readonly platform: ShomePlatform,
        private readonly accessory: PlatformAccessory,
    ) {
        const device = this.accessory.context.device;
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
            .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Samsung')
            .setCharacteristic(this.platform.Characteristic.Model, 'Doorlock')
            .setCharacteristic(this.platform.Characteristic.SerialNumber, device.thngId);

        this.service = this.accessory.getService(this.platform.Service.LockMechanism) ||
            this.accessory.addService(this.platform.Service.LockMechanism);

        this.service.setCharacteristic(this.platform.Characteristic.Name, device.nickname);

        this.service.getCharacteristic(this.platform.Characteristic.LockCurrentState)
            .onGet(this.getCurrentState.bind(this));

        this.service.getCharacteristic(this.platform.Characteristic.LockTargetState)
            .onGet(this.getCurrentState.bind(this))
            .onSet(this.setTargetState.bind(this));
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        const device = this.accessory.context.device;
        // 버그 수정: status가 0이면 잠김(SECURED), 그 외(1)는 열림(UNSECURED)
        // device.status가 boolean일 경우도 처리
        if (device.status === 0 || device.status === false) {
            return this.platform.Characteristic.LockCurrentState.UNSECURED;
        } else {
            return this.platform.Characteristic.LockCurrentState.SECURED;
        }
    }

    async setTargetState(value: CharacteristicValue) {
        const device = this.accessory.context.device;

        if (value === this.platform.Characteristic.LockTargetState.UNSECURED) {
            this.platform.log.info(`Unlocking ${device.nickname}...`);
            const success = await this.platform.shomeClient.unlockDoorlock(device.thngId);

            if (success) {
                this.platform.log.info(`${device.nickname} unlocked successfully.`);
                this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.UNSECURED);
            } else {
                this.platform.log.error(`Failed to unlock ${device.nickname}.`);
                setTimeout(() => {
                    this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
                }, 1000);
            }
        } else {
            this.platform.log.info(`Locking ${device.nickname} via the app is not supported.`);
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
            }, 1000);
        }
    }
}
