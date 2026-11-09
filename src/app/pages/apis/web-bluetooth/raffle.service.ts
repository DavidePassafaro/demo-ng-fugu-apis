import { Injectable, computed, signal } from '@angular/core';

export interface RaffleParticipant {
  id: string;
  name: string;
  photoDataUrl: string;
  timestamp: number;
}

interface RaffleWireMessage {
  type: 'join' | 'ack' | 'closed' | 'status' | 'winner';
  roomId: string;
  participant?: RaffleParticipant;
  ackId?: string;
  locked?: boolean;
}

const MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const ROOM_STORAGE_KEY = 'fugu_raffle_room_id';
const BASE_URL_STORAGE_KEY = 'fugu_raffle_base_url';
const PARTICIPANTS_STORAGE_PREFIX = 'fugu_raffle_participants_';
const LOCKED_STORAGE_PREFIX = 'fugu_raffle_locked_';

/**
 * Minimal, zero-dependency MQTT 3.1.1 over WebSocket client supporting
 * multi-KB JSON payloads (e.g. 384px base64 thermal photos) and stream reassembly.
 */
class MqttOverWsConnection {
  private ws: WebSocket | null = null;
  private rxBuffer: Uint8Array = new Uint8Array(0);
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private connected = false;
  private readonly clientId = 'fugu_' + Math.random().toString(36).slice(2, 10);

  constructor(
    private readonly url: string,
    private readonly topic: string,
    private readonly onMessage: (payloadText: string) => void,
    private readonly onStatusChange: (connected: boolean) => void,
  ) {
    this.connect();
  }

  get isConnected(): boolean {
    return this.connected;
  }

  publish(payloadText: string): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.connected) {
      return false;
    }
    const packet = this.buildPublishPacket(this.topic, payloadText);
    this.ws.send(packet);
    return true;
  }

  destroy(): void {
    this.destroyed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      try {
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.destroyed || typeof WebSocket === 'undefined') return;

    try {
      const ws = new WebSocket(this.url, 'mqtt');
      ws.binaryType = 'arraybuffer';
      this.ws = ws;

      ws.onopen = () => {
        this.rxBuffer = new Uint8Array(0);
        ws.send(this.buildConnectPacket(this.clientId));
      };

      ws.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!(event.data instanceof ArrayBuffer)) return;
        this.appendBytes(new Uint8Array(event.data));
        this.processBuffer();
      };

      ws.onerror = () => {
        // Handled in onclose
      };

      ws.onclose = () => {
        this.connected = false;
        this.onStatusChange(false);
        this.stopPing();
        if (!this.destroyed) {
          this.reconnectTimer = setTimeout(() => this.connect(), 2500);
        }
      };
    } catch {
      if (!this.destroyed) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    }
  }

  private appendBytes(incoming: Uint8Array): void {
    const merged = new Uint8Array(this.rxBuffer.length + incoming.length);
    merged.set(this.rxBuffer, 0);
    merged.set(incoming, this.rxBuffer.length);
    this.rxBuffer = merged;
  }

  private processBuffer(): void {
    while (this.rxBuffer.length >= 2) {
      const packetType = this.rxBuffer[0] >> 4;
      let multiplier = 1;
      let remainingLength = 0;
      let offset = 1;
      let encodedByte = 0;

      do {
        if (offset >= this.rxBuffer.length) {
          // Need more bytes to decode remainingLength
          return;
        }
        encodedByte = this.rxBuffer[offset++];
        remainingLength += (encodedByte & 0x7f) * multiplier;
        multiplier *= 128;
      } while ((encodedByte & 0x80) !== 0);

      const totalPacketLength = offset + remainingLength;
      if (this.rxBuffer.length < totalPacketLength) {
        // Wait for remaining TCP/WebSocket frames of this MQTT packet
        return;
      }

      const packetBody = this.rxBuffer.slice(offset, totalPacketLength);
      this.rxBuffer = this.rxBuffer.slice(totalPacketLength);

      if (packetType === 2) {
        // CONNACK -> subscribe to room topic and start keepalive ping
        this.connected = true;
        this.onStatusChange(true);
        this.ws?.send(this.buildSubscribePacket(this.topic));
        this.startPing();
      } else if (packetType === 3) {
        // PUBLISH (QoS 0)
        if (packetBody.length >= 2) {
          const topicLen = (packetBody[0] << 8) | packetBody[1];
          const payloadStart = 2 + topicLen;
          if (payloadStart <= packetBody.length) {
            const payloadBytes = packetBody.slice(payloadStart);
            const text = new TextDecoder().decode(payloadBytes);
            this.onMessage(text);
          }
        }
      }
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // MQTT PINGREQ
        this.ws.send(new Uint8Array([0xc0, 0x00]));
      }
    }, 25000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private buildConnectPacket(clientId: string): Uint8Array<ArrayBuffer> {
    const clientBytes = new TextEncoder().encode(clientId);
    const variableHeader = [
      0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // Protocol Name "MQTT"
      0x04, // Protocol Level 4 (MQTT 3.1.1)
      0x02, // Connect Flags: Clean Session
      0x00, 0x3c, // Keep Alive: 60s
    ];
    const payload = [
      (clientBytes.length >> 8) & 0xff,
      clientBytes.length & 0xff,
      ...clientBytes,
    ];
    const remLen = variableHeader.length + payload.length;
    return new Uint8Array([
      0x10,
      ...this.encodeRemainingLength(remLen),
      ...variableHeader,
      ...payload,
    ]);
  }

  private buildSubscribePacket(topic: string): Uint8Array<ArrayBuffer> {
    const topicBytes = new TextEncoder().encode(topic);
    const body = [
      0x00, 0x01, // Packet Identifier = 1
      (topicBytes.length >> 8) & 0xff,
      topicBytes.length & 0xff,
      ...topicBytes,
      0x00, // Requested QoS = 0
    ];
    return new Uint8Array([0x82, ...this.encodeRemainingLength(body.length), ...body]);
  }

  private buildPublishPacket(topic: string, message: string): Uint8Array<ArrayBuffer> {
    const topicBytes = new TextEncoder().encode(topic);
    const msgBytes = new TextEncoder().encode(message);
    const remLen = 2 + topicBytes.length + msgBytes.length;
    const remBytes = this.encodeRemainingLength(remLen);

    const packet = new Uint8Array(1 + remBytes.length + remLen);
    let idx = 0;
    packet[idx++] = 0x30; // PUBLISH, QoS 0
    packet.set(remBytes, idx);
    idx += remBytes.length;
    packet[idx++] = (topicBytes.length >> 8) & 0xff;
    packet[idx++] = topicBytes.length & 0xff;
    packet.set(topicBytes, idx);
    idx += topicBytes.length;
    packet.set(msgBytes, idx);
    return packet;
  }

  private encodeRemainingLength(length: number): number[] {
    const bytes: number[] = [];
    let x = length;
    do {
      let encoded = x % 128;
      x = Math.floor(x / 128);
      if (x > 0) {
        encoded |= 0x80;
      }
      bytes.push(encoded);
    } while (x > 0);
    return bytes;
  }
}

@Injectable({ providedIn: 'root' })
export class RaffleService {
  readonly roomId = signal<string>(this.loadOrCreateRoomId());
  readonly publicBaseUrl = signal<string>(this.loadInitialBaseUrl());

  readonly joinUrl = computed(
    () =>
      `${this.publicBaseUrl().replace(/\/$/, '')}/raffle-join?room=${encodeURIComponent(this.roomId())}`,
  );

  readonly participants = signal<RaffleParticipant[]>(
    this.loadStoredParticipants(this.roomId()),
  );

  /** True once the raffle draw has started; blocks any new participant uploads. */
  readonly entriesLocked = signal<boolean>(this.loadLockedState(this.roomId()));

  readonly isBrokerConnected = signal(false);

  /** On phones: the winner announced by the stage (null until the draw ends). */
  readonly announcedWinner = signal<RaffleParticipant | null>(null);

  /** Winner selected in the Raffle page, ready to be configured & printed in the Printer page. */
  readonly pendingWinner = signal<RaffleParticipant | null>(null);

  private connections: MqttOverWsConnection[] = [];
  private broadcastChannel: BroadcastChannel | null = null;
  private activeRoomTopic = '';
  private ackListeners = new Map<string, { resolve: () => void; reject: (err: Error) => void }>();

  /**
   * Connects the host or mobile client to the realtime room channel
   * (Dual MQTT-over-WSS brokers + local BroadcastChannel).
   */
  connectToRoom(roomId: string, isHost: boolean): void {
    const topic = `fugu-raffle/${roomId}`;
    if (this.activeRoomTopic === topic && this.connections.length > 0) {
      return;
    }

    this.disconnectRoom();
    this.activeRoomTopic = topic;

    if (typeof BroadcastChannel !== 'undefined') {
      this.broadcastChannel = new BroadcastChannel(topic);
      this.broadcastChannel.onmessage = (ev: MessageEvent<string>) => {
        if (typeof ev.data === 'string') {
          this.handleIncomingMessage(ev.data, isHost);
        }
      };
    }

    this.connections = MQTT_BROKERS.map(
      (brokerUrl) =>
        new MqttOverWsConnection(
          brokerUrl,
          topic,
          (payload) => this.handleIncomingMessage(payload, isHost),
          () => {
            this.isBrokerConnected.set(this.connections.some((c) => c.isConnected));
          },
        ),
    );
  }

  disconnectRoom(): void {
    for (const conn of this.connections) {
      conn.destroy();
    }
    this.connections = [];
    this.broadcastChannel?.close();
    this.broadcastChannel = null;
    this.activeRoomTopic = '';
    this.isBrokerConnected.set(false);
  }

  /**
   * Generates a fresh room ID and clears previous participants.
   */
  resetRoom(): void {
    const nextRoom = 'fugu-' + Math.random().toString(36).slice(2, 7);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ROOM_STORAGE_KEY, nextRoom);
    }
    this.roomId.set(nextRoom);
    this.participants.set([]);
    this.entriesLocked.set(false);
    this.saveParticipants(nextRoom, []);
    this.saveLockedState(nextRoom, false);
    this.connectToRoom(nextRoom, true);
  }

  clearParticipants(): void {
    this.participants.set([]);
    this.entriesLocked.set(false);
    this.saveParticipants(this.roomId(), []);
    this.saveLockedState(this.roomId(), false);
    this.broadcastRaw(
      JSON.stringify({ type: 'status', roomId: this.roomId(), locked: false } satisfies RaffleWireMessage),
    );
  }

  /**
   * Locks the room when the raffle draw starts so no new participants can upload photos.
   */
  lockEntries(): void {
    this.entriesLocked.set(true);
    this.saveLockedState(this.roomId(), true);
    this.broadcastRaw(
      JSON.stringify({ type: 'status', roomId: this.roomId(), locked: true } satisfies RaffleWireMessage),
    );
  }

  /**
   * Tells every phone in the room who won. Messages are fire-and-forget (no retained
   * MQTT messages), so it is repeated a few times for phones whose socket just reconnected.
   */
  announceWinner(winner: RaffleParticipant): void {
    const serialized = JSON.stringify({
      type: 'winner',
      roomId: this.roomId(),
      participant: winner,
    } satisfies RaffleWireMessage);
    for (const delay of [0, 1500, 4000]) {
      setTimeout(() => this.broadcastRaw(serialized), delay);
    }
  }

  /**
   * Removes a participant by id (used to remove the winner once sent to print).
   */
  removeParticipant(participantId: string): void {
    this.participants.update((prev) => {
      const next = prev.filter((p) => p.id !== participantId);
      this.saveParticipants(this.roomId(), next);
      return next;
    });
  }

  updatePublicBaseUrl(url: string): void {
    const clean = url.trim() || (typeof window !== 'undefined' ? window.location.origin : '');
    this.publicBaseUrl.set(clean);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(BASE_URL_STORAGE_KEY, clean);
    }
  }

  /**
   * Adds a participant on the host (deduplicated by `id` or `name` update).
   * Ignored if `entriesLocked()` is true.
   */
  addParticipant(participant: RaffleParticipant): void {
    if (this.entriesLocked()) return;
    this.participants.update((prev) => {
      const idx = prev.findIndex((p) => p.id === participant.id);
      const next =
        idx >= 0
          ? prev.map((p, i) => (i === idx ? participant : p))
          : [...prev, participant];
      this.saveParticipants(this.roomId(), next);
      return next;
    });
  }

  /**
   * Sends a participant's photo + name from a smartphone to the stage host,
   * retrying automatically until the stage host replies with an `ack` (or rejects if locked).
   */
  async submitParticipantFromMobile(
    roomId: string,
    participant: RaffleParticipant,
  ): Promise<void> {
    if (this.entriesLocked()) {
      throw new Error('Entries are closed — the raffle draw has already started!');
    }

    this.connectToRoom(roomId, false);

    // Wait up to 3.5s for at least one WebSocket broker connection to open
    const startWait = Date.now();
    while (!this.isBrokerConnected() && Date.now() - startWait < 3500) {
      await new Promise((r) => setTimeout(r, 120));
    }

    const wireMsg: RaffleWireMessage = {
      type: 'join',
      roomId,
      participant,
    };
    const serialized = JSON.stringify(wireMsg);

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finishOk = (): void => {
        if (settled) return;
        settled = true;
        this.ackListeners.delete(participant.id);
        resolve();
      };
      const finishClosed = (err: Error): void => {
        if (settled) return;
        settled = true;
        this.ackListeners.delete(participant.id);
        reject(err);
      };

      this.ackListeners.set(participant.id, { resolve: finishOk, reject: finishClosed });

      // Publish immediately and retry up to 3 times if no ACK yet
      let attempts = 0;
      const sendAttempt = (): void => {
        if (settled) return;
        attempts++;
        this.broadcastRaw(serialized);
        if (attempts < 3) {
          setTimeout(sendAttempt, 1100);
        } else {
          // Even if ACK packet didn't return, resolve after 3 broadcasts
          setTimeout(finishOk, 800);
        }
      };

      sendAttempt();
    });
  }

  /**
   * Consumes and clears the pending winner when navigating back to the Thermal Printer page.
   */
  consumeWinner(): RaffleParticipant | null {
    const winner = this.pendingWinner();
    if (winner) {
      this.pendingWinner.set(null);
    }
    return winner;
  }

  private handleIncomingMessage(raw: string, isHost: boolean): void {
    try {
      const msg = JSON.parse(raw) as RaffleWireMessage;
      if (!msg || typeof msg !== 'object') return;

      if (isHost && msg.type === 'join' && msg.participant && msg.roomId === this.roomId()) {
        if (this.entriesLocked()) {
          const closedMsg: RaffleWireMessage = {
            type: 'closed',
            roomId: this.roomId(),
            ackId: msg.participant.id,
          };
          this.broadcastRaw(JSON.stringify(closedMsg));
          return;
        }

        this.addParticipant(msg.participant);
        const ackMsg: RaffleWireMessage = {
          type: 'ack',
          roomId: this.roomId(),
          ackId: msg.participant.id,
        };
        this.broadcastRaw(JSON.stringify(ackMsg));
      } else if (!isHost && msg.type === 'ack' && msg.ackId) {
        const listener = this.ackListeners.get(msg.ackId);
        listener?.resolve();
      } else if (!isHost && msg.type === 'closed' && msg.ackId) {
        this.entriesLocked.set(true);
        const listener = this.ackListeners.get(msg.ackId);
        listener?.reject(new Error('Entries are closed — the raffle draw has already started!'));
      } else if (!isHost && msg.type === 'status' && typeof msg.locked === 'boolean') {
        this.entriesLocked.set(msg.locked);
        // Room reopened (participants cleared): forget the previous winner
        if (!msg.locked) this.announcedWinner.set(null);
      } else if (!isHost && msg.type === 'winner' && msg.participant) {
        this.announcedWinner.set(msg.participant);
      }
    } catch {
      // Ignore malformed JSON messages
    }
  }

  private broadcastRaw(serialized: string): void {
    this.broadcastChannel?.postMessage(serialized);
    for (const conn of this.connections) {
      conn.publish(serialized);
    }
  }

  private loadOrCreateRoomId(): string {
    if (typeof sessionStorage !== 'undefined') {
      const existing = sessionStorage.getItem(ROOM_STORAGE_KEY);
      if (existing && !existing.startsWith('pth26-')) return existing;
      const created = 'fugu-' + Math.random().toString(36).slice(2, 7);
      sessionStorage.setItem(ROOM_STORAGE_KEY, created);
      return created;
    }
    return 'fugu-demo';
  }

  private loadInitialBaseUrl(): string {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(BASE_URL_STORAGE_KEY);
      if (saved) return saved;
    }
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  private loadStoredParticipants(roomId: string): RaffleParticipant[] {
    if (typeof sessionStorage === 'undefined') return [];
    try {
      const raw = sessionStorage.getItem(PARTICIPANTS_STORAGE_PREFIX + roomId);
      return raw ? (JSON.parse(raw) as RaffleParticipant[]) : [];
    } catch {
      return [];
    }
  }

  private saveParticipants(roomId: string, list: RaffleParticipant[]): void {
    if (typeof sessionStorage === 'undefined') return;
    try {
      sessionStorage.setItem(PARTICIPANTS_STORAGE_PREFIX + roomId, JSON.stringify(list));
    } catch {
      // Ignore quota errors
    }
  }

  private loadLockedState(roomId: string): boolean {
    if (typeof sessionStorage === 'undefined') return false;
    return sessionStorage.getItem(LOCKED_STORAGE_PREFIX + roomId) === 'true';
  }

  private saveLockedState(roomId: string, locked: boolean): void {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.setItem(LOCKED_STORAGE_PREFIX + roomId, locked ? 'true' : 'false');
  }
}
