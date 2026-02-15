import amqplib, { Channel, ChannelModel } from "amqplib";

import { createLogger } from "./logger";

const logger = createLogger("rabbitmq");

export interface RabbitMQConfig {
  url: string;
  exchange: string;
  exchangeType?: string;
}

export class RabbitMQClient {
  private connection: ChannelModel | null = null;
  private channel: Channel | null = null;
  private config: RabbitMQConfig;

  constructor(config: RabbitMQConfig) {
    this.config = {
      exchangeType: "topic",
      ...config,
    };
  }

  async connect(): Promise<void> {
    try {
      this.connection = await amqplib.connect(this.config.url);
      this.channel = await this.connection.createChannel();
      await this.channel.assertExchange(
        this.config.exchange,
        this.config.exchangeType!,
        { durable: true }
      );
      logger.info(
        { exchange: this.config.exchange },
        "Connected to RabbitMQ"
      );

      this.connection.on("error", (err) => {
        logger.error(err, "RabbitMQ connection error");
      });

      this.connection.on("close", () => {
        logger.warn("RabbitMQ connection closed");
      });
    } catch (error) {
      logger.error(error, "Failed to connect to RabbitMQ");
      throw error;
    }
  }

  async publish(routingKey: string, message: unknown): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ channel not initialized");
    }

    this.channel.publish(
      this.config.exchange,
      routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: "application/json" }
    );

    logger.debug({ routingKey }, "Message published");
  }

  async subscribe(
    queue: string,
    routingKey: string,
    handler: (message: unknown) => Promise<void>
  ): Promise<void> {
    if (!this.channel) {
      throw new Error("RabbitMQ channel not initialized");
    }

    await this.channel.assertQueue(queue, { durable: true });
    await this.channel.bindQueue(queue, this.config.exchange, routingKey);

    this.channel.consume(queue, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content);
        this.channel!.ack(msg);
      } catch (error) {
        logger.error(error, "Error processing message");
        this.channel!.nack(msg, false, false);
      }
    });

    logger.info({ queue, routingKey }, "Subscribed to queue");
  }

  async close(): Promise<void> {
    try {
      await this.channel?.close();
      await this.connection?.close();
      logger.info("RabbitMQ connection closed");
    } catch (error) {
      logger.error(error, "Error closing RabbitMQ connection");
    }
  }
}
