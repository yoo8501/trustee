import { createLogger, RabbitMQClient } from "@trustee/common";
import { EVENT_ROUTING_KEYS, TrusteeDeletedEvent } from "@trustee/types";

import { InspectionService } from "./services";

const logger = createLogger("event-handlers");

export async function setupEventHandlers(
  rabbitmq: RabbitMQClient,
  inspectionService: InspectionService
) {
  // 수탁사 삭제 시 관련 점검 취소
  await rabbitmq.subscribe(
    "inspection.trustee-deleted",
    EVENT_ROUTING_KEYS.TRUSTEE_DELETED,
    async (message) => {
      const event = message as TrusteeDeletedEvent;
      logger.info(
        { trusteeId: event.data.id },
        "수탁사 삭제 이벤트 수신 - 점검 취소 처리"
      );

      await inspectionService.cancelByTrusteeId(
        event.data.id,
        `수탁사 '${event.data.companyName}' 삭제로 인한 자동 취소`
      );
    }
  );

  logger.info("이벤트 핸들러 설정 완료");
}
