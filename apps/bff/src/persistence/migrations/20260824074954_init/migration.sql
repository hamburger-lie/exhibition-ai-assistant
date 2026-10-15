-- CreateTable
CREATE TABLE "anonymous_session" (
    "id" TEXT NOT NULL,
    "session_token" TEXT NOT NULL,
    "anonymous_user_id" TEXT NOT NULL,
    "expo_id" TEXT NOT NULL,
    "default_conversation_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anonymous_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "expo_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "request_id" TEXT,
    "answer_status" TEXT,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_event" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "request_id" TEXT NOT NULL,
    "message_id" TEXT,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "props" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_signal_outbox" (
    "id" TEXT NOT NULL,
    "feedback_id" TEXT NOT NULL,
    "signal_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quality_signal_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_session_session_token_key" ON "anonymous_session"("session_token");

-- CreateIndex
CREATE INDEX "conversation_session_id_idx" ON "conversation"("session_id");

-- CreateIndex
CREATE INDEX "message_conversation_id_idx" ON "message"("conversation_id");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_feedback_id_key" ON "feedback"("feedback_id");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_event_event_id_key" ON "analytics_event"("event_id");

-- CreateIndex
CREATE INDEX "quality_signal_outbox_resolved_at_next_attempt_at_idx" ON "quality_signal_outbox"("resolved_at", "next_attempt_at");
