import type {
  EvidenceEvaluationResult,
  EvidencePacket,
} from "./evidenceTypes";

export type EvidenceStoreScope =
  | "request"
  | "session"
  | "workspace"
  | "manual";

export type EvidenceStoreRecord = {
  packetId: string;
  scope: EvidenceStoreScope;
  packet: EvidencePacket;
  evaluation?: EvidenceEvaluationResult;
  savedAt: number;
};

export type EvidenceStoreSaveInput = {
  packet: EvidencePacket;
  scope?: EvidenceStoreScope;
  evaluation?: EvidenceEvaluationResult;
};

export interface EvidenceStore {
  save(input: EvidenceStoreSaveInput): EvidenceStoreRecord;
  get(packetId: string): EvidenceStoreRecord | undefined;
  list(scope?: EvidenceStoreScope): EvidenceStoreRecord[];
  clear(scope?: EvidenceStoreScope): void;
}

const now = (): number => Date.now();

export const createInMemoryEvidenceStore = (): EvidenceStore => {
  const records = new Map<string, EvidenceStoreRecord>();

  return {
    save(input: EvidenceStoreSaveInput): EvidenceStoreRecord {
      const record: EvidenceStoreRecord = {
        packetId: input.packet.packetId,
        scope: input.scope ?? "request",
        packet: input.packet,
        evaluation: input.evaluation,
        savedAt: now(),
      };
      records.set(record.packetId, record);
      return record;
    },
    get(packetId: string): EvidenceStoreRecord | undefined {
      return records.get(packetId);
    },
    list(scope?: EvidenceStoreScope): EvidenceStoreRecord[] {
      const values = Array.from(records.values());
      return scope ? values.filter((record) => record.scope === scope) : values;
    },
    clear(scope?: EvidenceStoreScope): void {
      if (!scope) {
        records.clear();
        return;
      }
      for (const [packetId, record] of records.entries()) {
        if (record.scope === scope) {
          records.delete(packetId);
        }
      }
    },
  };
};
