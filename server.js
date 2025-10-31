const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Хранилище данных
let activeChats = new Map(); // chatId -> chat data
let userSockets = new Map(); // userId -> socketId
let chatMessages = new Map(); // chatId -> messages array

// Создание нового чата
app.post('/api/chats', (req, res) => {
  try {
    const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
    
    // Валидация данных
    if (!user_gender || !user_age || !partner_gender || !min_age || !max_age || !theme) {
      return res.status(400).json({ error: 'Все поля обязательны для заполнения' });
    }

    if (user_age < 18 || user_age > 80) {
      return res.status(400).json({ error: 'Возраст должен быть от 18 до 80 лет' });
    }

    if (min_age < 18 || max_age > 80 || min_age >= max_age) {
      return res.status(400).json({ error: 'Некорректный возрастной диапазон' });
    }
    
    const chatId = uuidv4();
    const chat = {
      id: chatId,
      creator_id: user_id,
      user_gender,
      user_age: parseInt(user_age),
      partner_gender,
      min_age: parseInt(min_age),
      max_age: parseInt(max_age),
      theme,
      participants: [user_id],
      created_at: new Date().toISOString(),
      status: 'waiting'
    };
    
    activeChats.set(chatId, chat);
    chatMessages.set(chatId, []);
    
    console.log(`🆕 New chat created: ${chatId}`);
    
    // Рассылаем всем клиентам о новом чате
    io.emit('new_chat_created', {
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: chat.participants.length
    });

    // ДОБАВЛЕНО: Синхронизация - принудительное обновление чатов у всех клиентов
    io.emit('chats_updated');
    io.emit('force_chats_refresh');
    
    res.json(chat);
  } catch (error) {
    console.error('❌ Error creating chat:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение списка чатов
app.get('/api/chats', (req, res) => {
  try {
    const chats = Array.from(activeChats.values())
      .filter(chat => chat.status === 'waiting')
      .map(chat => ({
        id: chat.id,
        user_gender: chat.user_gender,
        user_age: chat.user_age,
        partner_gender: chat.partner_gender,
        min_age: chat.min_age,
        max_age: chat.max_age,
        theme: chat.theme,
        created_at: chat.created_at,
        participants_count: chat.participants.length
      }));
    
    console.log(`📊 Sending ${chats.length} chats to client`);
    res.json(chats);
  } catch (error) {
    console.error('❌ Error fetching chats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
  try {
    const { chat_id, user_id, message } = req.body;
    
    if (!activeChats.has(chat_id)) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    
    const chat = activeChats.get(chat_id);
    if (!chat.participants.includes(user_id)) {
      return res.status(403).json({ error: 'Not a participant' });
    }
    
    const messageObj = {
      id: uuidv4(),
      chat_id,
      user_id,
      message,
      created_at: new Date().toISOString()
    };
    
    const messages = chatMessages.get(chat_id) || [];
    messages.push(messageObj);
    chatMessages.set(chat_id, messages);
    
    // Отправляем сообщение через WebSocket
    io.to(chat_id).emit('new_message', messageObj);
    
    res.json(messageObj);
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Получение сообщений чата
app.get('/api/messages', (req, res) => {
  try {
    const { chat_id } = req.query;
    
    if (!chatMessages.has(chat_id)) {
      return res.json([]);
    }
    
    const messages = chatMessages.get(chat_id);
    const anonymousMessages = messages.map(msg => ({
      id: msg.id,
      chat_id: msg.chat_id,
      user_id: msg.user_id,
      message: msg.message,
      created_at: msg.created_at
    }));
    
    res.json(anonymousMessages);
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Статистика онлайн пользователей
app.get('/api/stats', (req, res) => {
  try {
    const onlineUsers = userSockets.size;
    const activeChatsCount = Array.from(activeChats.values()).filter(chat => chat.status === 'active').length;
    
    res.json({
      online_users: onlineUsers,
      active_chats: activeChatsCount,
      waiting_chats: Array.from(activeChats.values()).filter(chat => chat.status === 'waiting').length
    });
  } catch (error) {
    console.error('❌ Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  // ДОБАВЛЕНО: Синхронизация между вкладками
  socket.on('chats_loaded', () => {
    console.log('🔄 Client loaded chats, notifying others');
    socket.broadcast.emit('chats_updated');
  });

  socket.on('new_chat_created_global', () => {
    console.log('🔄 New chat created globally, refreshing all clients');
    io.emit('chats_updated');
    io.emit('force_chats_refresh');
  });

  socket.on('chats_refreshed', () => {
    console.log('🔄 Chats refreshed, syncing all clients');
    socket.broadcast.emit('chats_updated');
  });

  // Присоединение к чату
  socket.on('join_chat', (data) => {
    try {
      const { chatId, userId } = data;
      
      if (!activeChats.has(chatId)) {
        socket.emit('error', { message: 'Chat not found' });
        return;
      }
      
      const chat = activeChats.get(chatId);
      
      // Проверяем можно ли присоединиться
      if (chat.participants.length >= 2 && !chat.participants.includes(userId)) {
        socket.emit('error', { message: 'Chat is full' });
        return;
      }
      
      // Добавляем пользователя если его нет
      if (!chat.participants.includes(userId)) {
        chat.participants.push(userId);
        
        // Если теперь 2 участника - активируем чат
        if (chat.participants.length === 2) {
          chat.status = 'active';
          
          // Уведомляем всех об активации чата
          io.emit('chat_activated', { chatId });
          io.to(chatId).emit('chat_activated', { chatId });

          // ДОБАВЛЕНО: Синхронизация - обновляем список чатов у всех
          io.emit('chats_updated');
        }
      }
      
      // Сохраняем связь пользователь -> сокет
      userSockets.set(userId, socket.id);
      
      // Присоединяем сокет к комнате чата
      socket.join(chatId);
      
      // Уведомляем о новом участнике (БЕЗ ИМЕНИ)
      socket.to(chatId).emit('user_joined', {
        chatId,
        participants: chat.participants.length
      });
      
      // Отправляем текущих онлайн пользователей (ТОЛЬКО КОЛИЧЕСТВО)
      io.to(chatId).emit('online_users', {
        chatId,
        count: chat.participants.length
      });
      
      console.log(`👥 User joined chat ${chatId}`);
    } catch (error) {
      console.error('❌ Error joining chat:', error);
      socket.emit('error', { message: 'Internal server error' });
    }
  });
  
  // Покидание чата
  socket.on('leave_chat', (data) => {
    try {
      const { chatId, userId } = data;
      
      if (activeChats.has(chatId)) {
        const chat = activeChats.get(chatId);
        
        // Удаляем пользователя из участников
        const userIndex = chat.participants.indexOf(userId);
        if (userIndex > -1) {
          chat.participants.splice(userIndex, 1);
          
          // Если участников не осталось - удаляем чат
          if (chat.participants.length === 0) {
            activeChats.delete(chatId);
            chatMessages.delete(chatId);
            // Уведомляем всех об удалении чата
            io.emit('chat_removed', { chatId });
            
            // ДОБАВЛЕНО: Синхронизация - обновляем список чатов
            io.emit('chats_updated');
          }
        }
        
        socket.leave(chatId);
        // Уведомляем без идентификации пользователя
        socket.to(chatId).emit('user_left', { chatId });
      }
    } catch (error) {
      console.error('❌ Error leaving chat:', error);
    }
  });
  
  // Индикатор печати (АНОНИМНЫЙ)
  socket.on('typing_start', (data) => {
    const { chatId } = data;
    socket.to(chatId).emit('typing_start', { chatId });
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId } = data;
    socket.to(chatId).emit('typing_stop', { chatId });
  });
  
  // Обработка отключения
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    // Находим и удаляем отключенного пользователя
    for (let [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }

    // ДОБАВЛЕНО: Уведомляем о возможных изменениях в чатах
    io.emit('chats_updated');
  });
});

// Очистка старых чатов каждые 10 минут
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000);
  
  let cleanedCount = 0;
  
  for (let [chatId, chat] of activeChats.entries()) {
    const chatTime = new Date(chat.created_at).getTime();
    
    if (chatTime < hourAgo) {
      activeChats.delete(chatId);
      chatMessages.delete(chatId);
      // Уведомляем всех об удалении чата
      io.emit('chat_removed', { chatId });
      console.log(`🗑️ Cleaned up old chat: ${chatId}`);
      cleanedCount++;
    }
  }

  // ДОБАВЛЕНО: Если были удалены чаты - синхронизируем клиентов
  if (cleanedCount > 0) {
    io.emit('chats_updated');
    console.log(`🔄 Syncing clients after cleaning ${cleanedCount} old chats`);
  }
}, 10 * 60 * 1000);

// ДОБАВЛЕНО: Периодическая синхронизация всех клиентов (каждые 30 секунд)
setInterval(() => {
  console.log('🔄 Periodic sync: refreshing all clients');
  io.emit('chats_updated');
}, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔄 Sync enabled: clients will be synchronized every 30 seconds`);
});
