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
            .onGet(this.getCurrentState.bind(this)) // 목표 상태도 현재 상태를 기반으로 표시
            .onSet(this.setTargetState.bind(this));
    }

    async getCurrentState(): Promise<CharacteristicValue> {
        const device = this.accessory.context.device;
        // status가 0이면 잠김(SECURED), 1이면 열림(UNSECURED)
        if (device.status === 0) {
            return this.platform.Characteristic.LockCurrentState.SECURED;
        } else {
            return this.platform.Characteristic.LockCurrentState.UNSECURED;
        }
    }

    async setTargetState(value: CharacteristicValue) {
        const device = this.accessory.context.device;

        if (value === this.platform.Characteristic.LockTargetState.UNSECURED) {
            this.platform.log.info(`Unlocking ${device.nickname}...`);
            const success = await this.platform.shomeClient.unlockDoorlock(device.thngId);

            if (success) {
                this.platform.log.info(`${device.nickname} unlocked successfully.`);
                // API 호출 성공 시, HomeKit 상태를 즉시 '열림'으로 업데이트
                this.service.updateCharacteristic(this.platform.Characteristic.LockCurrentState, this.platform.Characteristic.LockCurrentState.UNSECURED);
            } else {
                this.platform.log.error(`Failed to unlock ${device.nickname}.`);
                // 실패 시, 잠시 후 다시 '잠김' 상태로 되돌림
                setTimeout(() => {
                    this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
                }, 1000);
            }
        } else {
            // API는 잠금(SECURE) 기능을 제공하지 않으므로, 사용자가 잠금을 시도하면 로그를 남기고 상태를 되돌립니다.
            this.platform.log.info(`Locking ${device.nickname} via the app is not supported. The lock will secure automatically.`);
            setTimeout(() => {
                this.service.updateCharacteristic(this.platform.Characteristic.LockTargetState, this.platform.Characteristic.LockTargetState.SECURED);
            }, 1000);
        }
    }
}
