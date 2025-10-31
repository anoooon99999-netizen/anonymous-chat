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
let activeChats = new Map();
let userSockets = new Map();
let chatMessages = new Map();

// Создание нового чата
app.post('/api/chats', (req, res) => {
  try {
    const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
    
    if (!user_gender || !user_age || !partner_gender || !min_age || !max_age || !theme) {
      return res.status(400).json({ error: 'Все поля обязательны' });
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
    
    console.log(`🆕 Новый чат создан: ${chatId}, тема: ${theme}, создатель: ${user_id}`);
    
    // Рассылаем всем клиентам КРОМЕ создателя
    socket.broadcast.emit('new_chat_created', {
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: chat.participants.length,
      status: chat.status,
      creator_id: chat.creator_id
    });

    // Принудительно обновляем всех клиентов КРОМЕ создателя
    socket.broadcast.emit('force_refresh_chats');
    
    res.json(chat);
  } catch (error) {
    console.error('❌ Ошибка создания чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение списка чатов (ТОЛЬКО ЧУЖИЕ)
app.get('/api/chats', (req, res) => {
  try {
    const { user_id } = req.query;
    
    console.log(`📊 Запрос чатов от пользователя: ${user_id}`);
    
    const chats = Array.from(activeChats.values())
      .filter(chat => {
        const isNotCreator = chat.creator_id !== user_id;
        const isWaiting = chat.status === 'waiting';
        return isNotCreator && isWaiting;
      })
      .map(chat => ({
        id: chat.id,
        user_gender: chat.user_gender,
        user_age: chat.user_age,
        partner_gender: chat.partner_gender,
        min_age: chat.min_age,
        max_age: chat.max_age,
        theme: chat.theme,
        created_at: chat.created_at,
        participants_count: chat.participants.length,
        status: chat.status,
        creator_id: chat.creator_id
      }));
    
    console.log(`📊 Отправляем ${chats.length} чатов пользователю ${user_id}`);
    res.json(chats);
  } catch (error) {
    console.error('❌ Ошибка получения чатов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
  try {
    const { chat_id, user_id, message } = req.body;
    
    if (!activeChats.has(chat_id)) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    
    const chat = activeChats.get(chat_id);
    if (!chat.participants.includes(user_id)) {
      return res.status(403).json({ error: 'Не участник чата' });
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
    
    io.to(chat_id).emit('new_message', messageObj);
    
    res.json(messageObj);
  } catch (error) {
    console.error('❌ Ошибка отправки сообщения:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
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
    res.json(messages);
  } catch (error) {
    console.error('❌ Ошибка получения сообщений:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение моих чатов (для создателя)
app.get('/api/my_chats', (req, res) => {
  try {
    const { user_id } = req.query;
    
    const myChats = Array.from(activeChats.values())
      .filter(chat => chat.creator_id === user_id && chat.status === 'waiting')
      .map(chat => ({
        id: chat.id,
        user_gender: chat.user_gender,
        user_age: chat.user_age,
        partner_gender: chat.partner_gender,
        min_age: chat.min_age,
        max_age: chat.max_age,
        theme: chat.theme,
        created_at: chat.created_at,
        participants_count: chat.participants.length,
        status: chat.status,
        is_my_chat: true
      }));
    
    console.log(`📱 Мои чаты пользователя ${user_id}: ${myChats.length}`);
    res.json(myChats);
  } catch (error) {
    console.error('❌ Ошибка получения моих чатов:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 Новое подключение:', socket.id);
  
  // Синхронизация чатов
  socket.on('request_chats_update', (data) => {
    const { user_id } = data;
    console.log('🔄 Запрос обновления чатов от:', user_id);
    socket.broadcast.emit('force_refresh_chats');
  });

  socket.on('chats_updated', (data) => {
    const { user_id } = data;
    socket.broadcast.emit('force_refresh_chats', { exclude_user: user_id });
  });

  socket.on('new_chat_created_global', () => {
    socket.broadcast.emit('force_refresh_chats');
  });

  // Присоединение к чату
  socket.on('join_chat', (data) => {
    try {
      const { chatId, userId } = data;
      
      if (!activeChats.has(chatId)) {
        socket.emit('error', { message: 'Чат не найден' });
        return;
      }
      
      const chat = activeChats.get(chatId);
      
      // Если пользователь не создатель и чат в ожидании
      if (chat.status === 'waiting' && chat.creator_id !== userId) {
        if (chat.participants.length < 2) {
          chat.participants.push(userId);
          
          // Активируем чат при 2 участниках
          if (chat.participants.length === 2) {
            chat.status = 'active';
            console.log(`🎉 Чат активирован: ${chatId}`);
            
            // Уведомляем всех об активации
            io.emit('chat_activated', { chatId });
            io.to(chatId).emit('chat_activated', { chatId });
            
            // Удаляем чат из списка ожидания для всех
            io.emit('chat_removed', { chatId });
            
            // Обновляем всех клиентов
            io.emit('force_refresh_chats');
          }
        }
      }
      
      userSockets.set(userId, socket.id);
      socket.join(chatId);
      
      // Уведомляем других участников
      socket.to(chatId).emit('user_joined', { chatId, userId });
      
      // Обновляем счетчик онлайн
      io.to(chatId).emit('online_users', {
        chatId,
        users: chat.participants
      });
      
      console.log(`👥 Пользователь ${userId} присоединился к чату ${chatId}`);
      
    } catch (error) {
      console.error('❌ Ошибка присоединения к чату:', error);
      socket.emit('error', { message: 'Ошибка сервера' });
    }
  });
  
  // Покидание чата
  socket.on('leave_chat', (data) => {
    try {
      const { chatId, userId } = data;
      
      if (activeChats.has(chatId)) {
        const chat = activeChats.get(chatId);
        const userIndex = chat.participants.indexOf(userId);
        
        if (userIndex > -1) {
          chat.participants.splice(userIndex, 1);
          
          if (chat.participants.length === 0) {
            activeChats.delete(chatId);
            chatMessages.delete(chatId);
            io.emit('chat_removed', { chatId });
          }
          
          io.emit('force_refresh_chats');
        }
        
        socket.leave(chatId);
        socket.to(chatId).emit('user_left', { chatId, userId });
      }
    } catch (error) {
      console.error('❌ Ошибка выхода из чата:', error);
    }
  });
  
  // Индикатор печати
  socket.on('typing_start', (data) => {
    const { chatId } = data;
    socket.to(chatId).emit('typing_start', { chatId });
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId } = data;
    socket.to(chatId).emit('typing_stop', { chatId });
  });
  
  // Отключение
  socket.on('disconnect', () => {
    console.log('🔌 Отключение:', socket.id);
    
    for (let [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        break;
      }
    }
  });
});

// Автоматическая синхронизация каждые 10 секунд
setInterval(() => {
  io.emit('force_refresh_chats');
}, 10000);

// Очистка старых чатов (24 часа)
setInterval(() => {
  const now = Date.now();
  const dayAgo = now - (24 * 60 * 60 * 1000);
  
  let cleanedCount = 0;
  
  for (let [chatId, chat] of activeChats.entries()) {
    const chatTime = new Date(chat.created_at).getTime();
    
    if (chatTime < dayAgo) {
      activeChats.delete(chatId);
      chatMessages.delete(chatId);
      io.emit('chat_removed', { chatId });
      console.log(`🗑️ Удален старый чат: ${chatId}`);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    io.emit('force_refresh_chats');
  }
}, 60 * 60 * 1000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
