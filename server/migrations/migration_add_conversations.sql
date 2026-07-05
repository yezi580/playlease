-- Migration that creates conversation and message tables.

USE game_rental;

CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '会话唯一ID',
  type ENUM('order') NOT NULL DEFAULT 'order' COMMENT '会话类型',
  ref_id INT NOT NULL COMMENT '关联业务ID，当前为订单ID',
  title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '会话标题',
  status ENUM('active', 'closed') NOT NULL DEFAULT 'active' COMMENT '会话状态',
  last_message_preview VARCHAR(255) DEFAULT NULL COMMENT '最后一条消息预览',
  last_message_at DATETIME DEFAULT NULL COMMENT '最后一条消息时间',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
  UNIQUE INDEX uk_conversations_type_ref (type, ref_id),
  INDEX idx_conversations_last_message_at (last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '记录唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  user_id INT NOT NULL COMMENT '参与人用户ID',
  role ENUM('buyer', 'seller', 'support') NOT NULL DEFAULT 'buyer' COMMENT '会话角色',
  last_read_message_id INT DEFAULT NULL COMMENT '最后已读消息ID',
  unread_message_count INT NOT NULL DEFAULT 0 COMMENT '当前未读消息数',
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE INDEX uk_conversation_participants_user (conversation_id, user_id),
  INDEX idx_conversation_participants_user_id (user_id),
  INDEX idx_conversation_participants_user_conversation_read (user_id, conversation_id, last_read_message_id, unread_message_count)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversation_messages (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '消息唯一ID',
  conversation_id INT NOT NULL COMMENT '关联会话ID',
  sender_user_id INT NOT NULL COMMENT '发送人用户ID',
  message_type ENUM('text', 'system') NOT NULL DEFAULT 'text' COMMENT '消息类型',
  content TEXT NOT NULL COMMENT '消息内容',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation_messages_conversation (conversation_id, id),
  INDEX idx_conversation_messages_sender (sender_user_id),
  INDEX idx_conversation_messages_conversation_sender_id (conversation_id, sender_user_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
