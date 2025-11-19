import { API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import { ShomeClient, MainDevice, SubDevice, Visitor, ParkingEvent, MaintenanceFeeData } from './shomeClient.js';
import { LightAccessory } from './accessories/lightAccessory.js';
import { VentilatorAccessory } from './accessories/ventilatorAccessory.js';
import { HeaterAccessory } from './accessories/heaterAccessory.js';
import { DoorlockAccessory } from './accessories/doorlockAccessory.js';
import { DoorbellAccessory } from './accessories/doorbellAccessory.js';
import { ParkingAccessory } from './accessories/parkingAccessory.js';
import { MaintenanceFeeAccessory } from './accessories/maintenanceFeeAccessory.js';

const CONTROLLABLE_MULTI_DEVICE_TYPES = ['LIGHT', 'HEATER', 'VENTILATOR'];
const SPECIAL_CONTROLLABLE_TYPES = ['DOORLOCK'];

type AccessoryHandler = LightAccessory | VentilatorAccessory | HeaterAccessory |
    DoorlockAccessory | DoorbellAccessory | ParkingAccessory | MaintenanceFeeAccessory;

export class ShomePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  public readonly shomeClient: ShomeClient;
  private readonly accessoryHandlers = new Map<string, AccessoryHandler>();
  private pollingInterval: number;
  private pollingTimer?: NodeJS.Timeout;
  private isPolling = false;

  private lastCheckedTimestamp: Date = new Date();
  private lastCheckedParkingTimestamp: Date = new Date();
  private lastCheckedMaintenanceFeeMonth: string | null = null;
  private isInitializingMaintenanceFee = false;
  private isInitializingParking = true;

  constructor(
        public readonly log: Logger,
        public readonly config: PlatformConfig,
        public readonly api: API,
  ) {
    this.Service = this.api.hap.Service;
    this.Characteristic = this.api.hap.Characteristic;
    this.pollingInterval = this.config.pollingInterval ?? 3000;

    if (!this.config.username || !this.config.password || !this.config.deviceId) {
      this.log.error('Missing required configuration. Please check your config.json file.');
      this.log.error('Required fields are: "username", "password", and "deviceId".');
      this.shomeClient = null!;
      return;
    }

    this.shomeClient = new ShomeClient(
      this.log,
      this.config.username,
      this.config.password,
      this.config.deviceId,
    );

    this.log.info(`Video Doorbell service is active. Baseline time: ${this.lastCheckedTimestamp.toISOString()}`);

    this.api.on('didFinishLaunching', () => {
      this.discoverDevices();
      if (this.pollingInterval > 0) {
        this.startPolling();
      }
    });

    this.api.on('shutdown', () => {
      if (this.pollingTimer) {
        clearTimeout(this.pollingTimer);
      }

      for (const handler of this.accessoryHandlers.values()) {
        if (handler instanceof DoorbellAccessory) {
          handler.shutdown();
        }
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.accessories.push(accessory);
  }

  async discoverDevices() {
    if (!this.shomeClient) {
      return;
    }

    try {
      this.log.info('Discovering devices...');
      const devices = await this.shomeClient.getDeviceList();
      const foundAccessories: PlatformAccessory[] = [];

      for (const device of devices) {
        if (CONTROLLABLE_MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
          const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
          if (deviceInfoList) {
            for (const subDevice of deviceInfoList) {
              const uuid = this.api.hap.uuid.generate(`${device.thngId}-${subDevice.deviceId}`);
              const accessory = this.setupAccessory(device, subDevice, uuid);
              foundAccessories.push(accessory);
            }
          }
        } else if (SPECIAL_CONTROLLABLE_TYPES.includes(device.thngModelTypeName)) {
          const uuid = this.api.hap.uuid.generate(device.thngId);
          const accessory = this.setupAccessory(device, null, uuid);
          foundAccessories.push(accessory);
        }
      }

      const doorbellUUID = this.api.hap.uuid.generate('shome-doorbell');
      const doorbellDevice = { thngModelTypeName: 'DOORBELL', nickname: 'Doorbell', thngId: 'shome-doorbell' } as MainDevice;
      const doorbellAccessory = this.setupAccessory(doorbellDevice, null, doorbellUUID);
      foundAccessories.push(doorbellAccessory);

      const parkingUUID = this.api.hap.uuid.generate('shome-parking');
      const parkingDevice = { thngModelTypeName: 'PARKING', nickname: 'Parking Sensor', thngId: 'shome-parking' } as MainDevice;
      const parkingAccessory = this.setupAccessory(parkingDevice, null, parkingUUID);
      foundAccessories.push(parkingAccessory);

      const feeUUID = this.api.hap.uuid.generate('shome-maintenance-fee');
      const feeDevice = { thngModelTypeName: 'MAINTENANCE_FEE', nickname: 'Maintenance Fee', thngId: 'shome-maintenance-fee' } as MainDevice;
      const feeAccessory = this.setupAccessory(feeDevice, null, feeUUID);
      foundAccessories.push(feeAccessory);

      const accessoriesToRemove = this.accessories.filter(cachedAccessory =>
        !foundAccessories.some(foundAccessory => foundAccessory.UUID === cachedAccessory.UUID),
      );

      if (accessoriesToRemove.length > 0) {
        this.log.info('Removing stale accessories:', accessoriesToRemove.map(a => a.displayName));
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRemove);
        accessoriesToRemove.forEach(acc => this.accessoryHandlers.delete(acc.UUID));
      }
      this.log.info('Device discovery finished.');
    } catch (error) {
      this.log.error('Failed to discover devices due to a network or API error.');
    }
  }

  setupAccessory(mainDevice: MainDevice, subDevice: SubDevice | null, uuid: string): PlatformAccessory {
    const displayName = subDevice ? subDevice.nickname : mainDevice.nickname;
    const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    const accessory = existingAccessory ?? new this.api.platformAccessory(displayName, uuid);
    accessory.context.device = mainDevice;
    accessory.context.subDevice = subDevice;

    if (existingAccessory) {
      this.log.info('Restoring existing accessory from cache:', displayName);
    } else {
      this.log.info('Adding new accessory:', displayName);
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }

    this.createAccessoryHandler(accessory);
    return accessory;
  }

  createAccessoryHandler(accessory: PlatformAccessory) {
    const device = accessory.context.device;
    const accessoryType = device.thngModelTypeName;

    if (this.accessoryHandlers.has(accessory.UUID)) {
      return;
    }

    if (accessory.context.subDevice) {
      switch (device.thngModelTypeName) {
      case 'LIGHT':
        this.accessoryHandlers.set(accessory.UUID, new LightAccessory(this, accessory));
        break;
      case 'VENTILATOR':
        this.accessoryHandlers.set(accessory.UUID, new VentilatorAccessory(this, accessory));
        break;
      case 'HEATER':
        this.accessoryHandlers.set(accessory.UUID, new HeaterAccessory(this, accessory));
        break;
      }
      return;
    }

    switch (accessoryType) {
    case 'DOORLOCK':
      this.accessoryHandlers.set(accessory.UUID, new DoorlockAccessory(this, accessory));
      break;
    case 'DOORBELL':
      this.accessoryHandlers.set(accessory.UUID, new DoorbellAccessory(this, accessory));
      break;
    case 'PARKING':
      this.accessoryHandlers.set(accessory.UUID, new ParkingAccessory(this, accessory));
      break;
    case 'MAINTENANCE_FEE':
      this.accessoryHandlers.set(accessory.UUID, new MaintenanceFeeAccessory(this, accessory));
      break;
    }
  }

  startPolling() {
    this.log.info(`Starting periodic state polling every ${this.pollingInterval / 1000} seconds.`);

    const pollCycle = async (): Promise<void> => {
      if (this.isPolling) {
        this.log.warn('Previous polling cycle still running. Skipping this cycle to prevent overlap.');
        if (this.pollingInterval > 0) {
          this.pollingTimer = setTimeout(pollCycle, this.pollingInterval);
        }
        return;
      }

      this.isPolling = true;
      const startedAt = Date.now();
      this.log.debug('Polling for updates...');
      try {
        await this.pollDeviceUpdates();
        await this.checkForNewVisitors();
        await this.checkForNewParkingEvents();
        await this.checkForNewMaintenanceFee();
      } catch (error) {
        this.log.error('An error occurred during polling:', error);
      } finally {
        const elapsed = Date.now() - startedAt;
        this.log.debug(`Polling cycle finished in ${elapsed} ms.`);
        this.isPolling = false;
        if (this.pollingInterval > 0) {
          this.pollingTimer = setTimeout(pollCycle, this.pollingInterval);
        }
      }
    };

    if (this.pollingInterval > 0) {
      this.pollingTimer = setTimeout(pollCycle, this.pollingInterval);
    }
  }

  async pollDeviceUpdates() {
    const devices = await this.shomeClient.getDeviceList();
    for (const device of devices) {
      if (CONTROLLABLE_MULTI_DEVICE_TYPES.includes(device.thngModelTypeName)) {
        const deviceInfoList = await this.shomeClient.getDeviceInfo(device.thngId, device.thngModelTypeName);
        if (deviceInfoList) {
          for (const subDevice of deviceInfoList) {
            const deviceId = `${device.thngId}-${subDevice.deviceId}`;
            if (this.shomeClient.isDeviceBusy(deviceId)) {
              this.log.debug(`Skipping polling update for ${subDevice.nickname} as it has a pending request.`);
              continue;
            }
            const subUuid = this.api.hap.uuid.generate(deviceId);
            const handler = this.accessoryHandlers.get(subUuid) as LightAccessory | HeaterAccessory | VentilatorAccessory;
            if (handler) {
              handler.updateState(subDevice);
            }
          }
        }
      } else if (SPECIAL_CONTROLLABLE_TYPES.includes(device.thngModelTypeName)) {
        const deviceId = device.thngId;
        if (this.shomeClient.isDeviceBusy(deviceId)) {
          this.log.debug(`Skipping polling update for ${device.nickname} as it has a pending request.`);
          continue;
        }
        const uuid = this.api.hap.uuid.generate(deviceId);
        const handler = this.accessoryHandlers.get(uuid) as DoorlockAccessory;
        if (handler) {
          handler.updateState(device);
        }
      }
    }
  }

  async checkForNewVisitors() {
    this.log.debug('Checking for new doorbell events...');
    const visitorList = await this.shomeClient.getVisitorHistory();
    const newVisitors: Visitor[] = [];

    for (const visitor of visitorList) {
      const visitorTime = this.parseRecordDt(visitor.recodDt);

      if (visitorTime > this.lastCheckedTimestamp) {
        newVisitors.push(visitor);
      }
    }

    if (newVisitors.length > 0) {
      this.log.info(`Found ${newVisitors.length} new doorbell event(s).`);
      newVisitors.sort((a, b) => a.recodDt.localeCompare(b.recodDt));

      const doorbellUUID = this.api.hap.uuid.generate('shome-doorbell');
      const doorbellHandler = this.accessoryHandlers.get(doorbellUUID) as DoorbellAccessory | undefined;

      if (doorbellHandler) {
        for (const visitor of newVisitors) {
          doorbellHandler.newVisitor(visitor);
        }
      } else {
        this.log.warn('Doorbell accessory handler not found.');
      }

      const latestVisitor = newVisitors[newVisitors.length - 1];
      this.lastCheckedTimestamp = this.parseRecordDt(latestVisitor.recodDt);
      this.log.debug(`Updated last checked timestamp to: ${this.lastCheckedTimestamp.toISOString()}`);
    }
  }

  async checkForNewParkingEvents() {
    this.log.debug('Checking for new parking events...');
    const parkingEventList = await this.shomeClient.getParkingHistory();

    // 최초 실행 시에는 알림을 발생시키지 않고, 최신 이벤트의 시각으로 기준만 설정합니다.
    if (this.isInitializingParking) {
      if (parkingEventList.length > 0) {
        // 최신 이벤트 기준으로 정렬 후 마지막(가장 최근) 이벤트의 시간으로 기준 설정
        const sorted = [...parkingEventList].sort((a, b) => a.park_date.localeCompare(b.park_date));
        const latest = sorted[sorted.length - 1];
        this.lastCheckedParkingTimestamp = new Date(latest.park_date);
        this.log.info(`Initialized parking baseline to latest event: ${this.lastCheckedParkingTimestamp.toISOString()}`);
      } else {
        // 이력이 없다면 현재 시각을 기준으로 설정
        this.lastCheckedParkingTimestamp = new Date();
        this.log.info(`No parking history found. Initialized parking baseline to now: ${this.lastCheckedParkingTimestamp.toISOString()}`);
      }
      this.isInitializingParking = false;
      return;
    }
    const newParkingEvents: ParkingEvent[] = [];

    for (const event of parkingEventList) {
      const eventTime = new Date(event.park_date);

      if (eventTime > this.lastCheckedParkingTimestamp) {
        newParkingEvents.push(event);
      }
    }

    if (newParkingEvents.length > 0) {
      this.log.info(`Found ${newParkingEvents.length} new parking event(s).`);
      newParkingEvents.sort((a, b) => a.park_date.localeCompare(b.park_date));

      const parkingUUID = this.api.hap.uuid.generate('shome-parking');
      const parkingHandler = this.accessoryHandlers.get(parkingUUID) as ParkingAccessory | undefined;

      if (parkingHandler) {
        for (const event of newParkingEvents) {
          parkingHandler.newParkingEvent(event);
        }
      } else {
        this.log.warn('Parking accessory handler not found.');
      }

      const latestEvent = newParkingEvents[newParkingEvents.length - 1];
      this.lastCheckedParkingTimestamp = new Date(latestEvent.park_date);
      this.log.debug(`Updated last checked parking timestamp to: ${this.lastCheckedParkingTimestamp.toISOString()}`);
    }
  }

  async checkForNewMaintenanceFee() {
    if (this.isInitializingMaintenanceFee) {
      this.log.debug('Maintenance fee initialization is already in progress. Skipping check.');
      return;
    }

    if (!this.lastCheckedMaintenanceFeeMonth) {
      this.isInitializingMaintenanceFee = true;
      this.log.debug('First run for maintenance fee check. Finding the latest available data...');

      try {
        const now = new Date();
        let initialFeeData: MaintenanceFeeData | null = null;
        let initialYear = now.getFullYear();
        let initialMonth = now.getMonth() + 1;

        for (let i = 0; i < 3; i++) {
          const feeData = await this.shomeClient.getMaintenanceFee(initialYear, initialMonth);
          if (feeData && feeData.expense_total && feeData.expense_total.length > 0 && feeData.expense_total[0].money > 0) {
            initialFeeData = feeData;
            break;
          }
          initialMonth--;
          if (initialMonth === 0) {
            initialMonth = 12;
            initialYear--;
          }
        }

        if (initialFeeData) {
          const monthStr = `${initialFeeData.search_year}-${initialFeeData.search_month}`;
          this.log.info(`Found initial latest maintenance fee data for ${monthStr}.`);
          this.lastCheckedMaintenanceFeeMonth = monthStr;
        } else {
          this.log.debug('Could not find any maintenance fee data for the last 3 months on first run.');
          const twoMonthsAgo = new Date();
          twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
          this.lastCheckedMaintenanceFeeMonth = `${twoMonthsAgo.getFullYear()}-${String(twoMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
          this.log.debug(`Setting baseline check month to ${this.lastCheckedMaintenanceFeeMonth}.`);
        }
      } finally {
        this.isInitializingMaintenanceFee = false;
      }
      return;
    }

    let [lastYear, lastMonth] = this.lastCheckedMaintenanceFeeMonth.split('-').map(Number);

    for (let i = 0; i < 3; i++) {
      let nextMonth = lastMonth + 1;
      let nextYear = lastYear;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }

      const now = new Date();
      if (nextYear > now.getFullYear() || (nextYear === now.getFullYear() && nextMonth > now.getMonth() + 1)) {
        break;
      }

      const nextMonthStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}`;
      this.log.debug(`Proactively checking for maintenance fee for ${nextMonthStr}...`);
      const feeData = await this.shomeClient.getMaintenanceFee(nextYear, nextMonth);

      if (feeData && feeData.expense_total && feeData.expense_total.length > 0 && feeData.expense_total[0].money > 0) {
        this.log.info(`Found new maintenance fee data for ${nextMonthStr}.`);

        const feeUUID = this.api.hap.uuid.generate('shome-maintenance-fee');
        const feeHandler = this.accessoryHandlers.get(feeUUID) as MaintenanceFeeAccessory | undefined;
        if (feeHandler) {
          feeHandler.triggerNotification(feeData);
          this.lastCheckedMaintenanceFeeMonth = nextMonthStr;
          this.log.debug(`Last checked maintenance fee month updated to: ${nextMonthStr}`);

          lastYear = nextYear;
          lastMonth = nextMonth;
        } else {
          this.log.warn('Maintenance fee accessory handler not found.');
          break;
        }
      } else {
        this.log.debug(`No maintenance fee data found for ${nextMonthStr}. Stopping check for this cycle.`);
        break;
      }
    }
  }

  private parseRecordDt(recordDt: string): Date {
    const year = parseInt(recordDt.substring(0, 4), 10);
    const month = parseInt(recordDt.substring(4, 6), 10) - 1;
    const day = parseInt(recordDt.substring(6, 8), 10);
    const hour = parseInt(recordDt.substring(8, 10), 10);
    const minute = parseInt(recordDt.substring(10, 12), 10);
    const second = parseInt(recordDt.substring(12, 14), 10);
    return new Date(Date.UTC(year, month, day, hour, minute, second));
  }
}
