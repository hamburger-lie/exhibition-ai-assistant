-- CreateTable
CREATE TABLE "chat_idempotency" (
    "id" TEXT NOT NULL,
    "client_message_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "lease_expires_at" TIMESTAMP(3) NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_idempotency_client_message_id_key" ON "chat_idempotency"("client_message_id");

-- CreateIndex
CREATE INDEX "chat_idempotency_status_lease_expires_at_idx" ON "chat_idempotency"("status", "lease_expires_at");
