const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Настройка CORS для онлайн работы
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Статика из корневой папки

// Основной маршрут
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Хранилище данных в памяти
let activeChats = new Map();      // Чаты с 1 участником (ожидание)
let activeConnections = new Map(); // Активные чаты с 2 участниками
let chatMessages = new Map();     // Сообщения всех чатов
let userSockets = new Map();      // Привязка userId к socketId

// API маршруты
app.post('/api/chats', (req, res) => {
  try {
    const { user_id, user_gender, user_age, partner_gender, min_age, max_age, theme } = req.body;
    
    const chatId = uuidv4();
    const chat = {
      id: chatId,
      user_id: user_id,
      user_gender,
      user_age: parseInt(user_age),
      partner_gender,
      min_age: parseInt(min_age),
      max_age: parseInt(max_age),
      theme,
      participants_count: 1,
      created_at: new Date().toISOString()
    };
    
    // Сохраняем в активные чаты (ожидающие второго участника)
    activeChats.set(chatId, chat);
    chatMessages.set(chatId, []);
    
    console.log(`🆕 Новый чат создан: ${chatId}, создатель: ${user_id}`);
    
    // Рассылаем всем клиентам о новом чате
    io.emit('new_chat_created', chat);

    res.json({
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      participants_count: 1,
      created_at: chat.created_at,
      user_id: chat.user_id
    });
  } catch (error) {
    console.error('❌ Ошибка создания чата:', error);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получение списка чатов (только ожидающие с 1 участником)
app.get('/api/chats', (req, res) => {
  const chats = Array.from(activeChats.values())
    .filter(chat => chat.participants_count === 1)
    .map(chat => ({
      id: chat.id,
      user_gender: chat.user_gender,
      user_age: chat.user_age,
      partner_gender: chat.partner_gender,
      min_age: chat.min_age,
      max_age: chat.max_age,
      theme: chat.theme,
      created_at: chat.created_at,
      participants_count: 1,
      user_id: chat.user_id
    }));
  
  console.log(`📋 Запрос списка чатов: найдено ${chats.length} активных чатов`);
  res.json(chats);
});

// Отправка сообщения
app.post('/api/messages', (req, res) => {
  const { chat_id, user_id, message } = req.body;
  
  // Проверяем существует ли чат
  const activeChat = activeChats.get(chat_id);
  const activeConnection = activeConnections.get(chat_id);
  
  if (!activeChat && !activeConnection) {
    return res.status(404).json({ error: 'Chat not found' });
  }
  
  const messageObj = {
    id: uuidv4(),
    chat_id,
    user_id,
    message,
    created_at: new Date().toISOString()
  };
  
  // Сохраняем сообщение
  const messages = chatMessages.get(chat_id) || [];
  messages.push(messageObj);
  chatMessages.set(chat_id, messages);
  
  // Отправляем сообщение всем участникам чата
  io.to(chat_id).emit('new_message', messageObj);
  
  res.json(messageObj);
});

// Получение сообщений чата
app.get('/api/messages', (req, res) => {
  const { chat_id } = req.query;
  
  if (!chatMessages.has(chat_id)) {
    return res.json([]);
  }
  
  const messages = chatMessages.get(chat_id);
  res.json(messages);
});

// Socket.io обработчики
io.on('connection', (socket) => {
  console.log('🔗 User connected:', socket.id);
  
  // Сохраняем привязку userId к socketId
  socket.on('set_user_id', (userId) => {
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    console.log(`📝 User ${userId} associated with socket ${socket.id}`);
  });
  
  // Присоединение к чату
  socket.on('join_chat', (data) => {
    const { chatId, userId } = data;
    
    console.log(`👥 Попытка присоединения: user ${userId} к чату ${chatId}`);
    
    // Сохраняем userId для этого сокета
    userSockets.set(userId, socket.id);
    socket.userId = userId;
    
    // Проверяем где находится чат
    const activeChat = activeChats.get(chatId);
    const activeConnection = activeConnections.get(chatId);
    
    // Если чат уже активен (2 участника) - просто присоединяем
    if (activeConnection) {
        console.log(`✅ User ${userId} присоединяется к активному чату ${chatId}`);
        socket.join(chatId);
        
        // Отправляем историю сообщений
        const messages = chatMessages.get(chatId) || [];
        socket.emit('chat_messages', { chatId, messages });
        
        // Обновляем онлайн счетчик
        const participants = activeConnection.participants || [];
        io.to(chatId).emit('online_users', {
            chatId,
            count: participants.length,
            users: participants
        });
        
        // Уведомляем других участников
        socket.to(chatId).emit('user_joined', {
            chatId,
            userId,
            participants_count: participants.length
        });
        
        return;
    }
    
    // Если чат ожидает участника
    if (!activeChat) {
        socket.emit('error', { message: 'Chat not found' });
        return;
    }
    
    const chat = activeChats.get(chatId);
    
    // Проверяем можно ли присоединиться
    if (chat.participants_count !== 1) {
        socket.emit('error', { message: 'Chat is already full' });
        return;
    }
    
    // Если создатель присоединяется к своему чату
    if (chat.user_id === userId) {
        console.log(`👑 Создатель ${userId} присоединяется к своему чату ${chatId}`);
        socket.join(chatId);
        
        // Отправляем историю сообщений создателю
        const messages = chatMessages.get(chatId) || [];
        socket.emit('chat_messages', { chatId, messages });
        
        // Обновляем онлайн счетчик
        io.to(chatId).emit('online_users', {
            chatId,
            count: 1,
            users: [userId]
        });
        return;
    }
    
    console.log(`✅ User ${userId} присоединяется к чату ${chatId} как второй участник`);
    
    // Активируем чат - находим второго участника
    chat.participants_count = 2;
    
    // Перемещаем чат в активные соединения
    activeChats.delete(chatId);
    activeConnections.set(chatId, {
        ...chat,
        participants: [chat.user_id, userId],
        participants_count: 2
    });
    
    // УДАЛЯЕМ чат из общего списка для всех
    io.emit('chat_activated', { chatId });
    
    console.log(`🎉 Чат ${chatId} активирован! Участники: ${chat.user_id} и ${userId}`);
    
    // Присоединяем нового участника к комнате
    socket.join(chatId);
    
    // Находим сокет создателя и присоединяем его тоже
    const creatorSocketId = userSockets.get(chat.user_id);
    if (creatorSocketId && io.sockets.sockets.get(creatorSocketId)) {
        const creatorSocket = io.sockets.sockets.get(creatorSocketId);
        creatorSocket.join(chatId);
        
        // Уведомляем создателя об активации чата
        creatorSocket.emit('chat_activated', {
            chatId,
            message: 'Собеседник найден! Чат активирован.'
        });
        
        // Отправляем историю создателю
        const messages = chatMessages.get(chatId) || [];
        creatorSocket.emit('chat_messages', { chatId, messages });
    }
    
    // Уведомляем нового участника об активации
    socket.emit('chat_activated', {
        chatId,
        message: 'Чат активирован! Начинайте общение.'
    });
    
    // Уведомляем о новом участнике
    socket.to(chatId).emit('user_joined', {
        chatId,
        userId,
        participants_count: 2
    });
    
    // Обновляем онлайн счетчик для всех
    io.to(chatId).emit('online_users', {
        chatId,
        count: 2,
        users: [chat.user_id, userId]
    });
    
    // Отправляем историю сообщений новому участнику
    const messages = chatMessages.get(chatId) || [];
    socket.emit('chat_messages', { chatId, messages });
  });
  
  // Покидание чата
  socket.on('leave_chat', (data) => {
    const { chatId, userId } = data;
    
    console.log(`🚪 User ${userId} покидает чат ${chatId}`);
    
    // Проверяем где находится чат
    const activeChat = activeChats.get(chatId);
    const activeConnection = activeConnections.get(chatId);
    
    if (activeConnection) {
      // Чат активен (2 участника)
      const chat = activeConnection;
      
      // Уменьшаем количество участников
      chat.participants_count = Math.max(0, chat.participants_count - 1);
      
      // Удаляем пользователя из списка участников
      if (chat.participants) {
        chat.participants = chat.participants.filter(id => id !== userId);
      }
      
      console.log(`📊 В чате ${chatId} осталось участников: ${chat.participants_count}`);
      
      // Уведомляем оставшихся участников о выходе
      socket.to(chatId).emit('user_left', { 
        chatId, 
        userId
      });
      
      // Обновляем онлайн счетчик
      const remainingUsers = chat.participants || [];
      io.to(chatId).emit('online_users', {
        chatId,
        count: remainingUsers.length,
        users: remainingUsers
      });
      
      // Если участников не осталось - полностью удаляем чат
      if (chat.participants_count === 0) {
        activeConnections.delete(chatId);
        chatMessages.delete(chatId);
        console.log(`🗑️ Чат ${chatId} полностью удален (нет участников)`);
      } 
      // Если остался 1 участник (создатель)
      else if (chat.participants_count === 1 && chat.user_id !== userId) {
        console.log(`🎯 Участник ${userId} вышел, уведомляем создателя ${chat.user_id}`);
        
        // Отправляем создателю уведомление о выходе участника
        io.to(chatId).emit('user_left', {
          chatId,
          userId,
          isPartnerLeft: true
        });
      }
      
    } else if (activeChat) {
      // Чат ожидает участника (1 участник)
      const chat = activeChat;
      
      // Если создатель покидает свой чат - полностью удаляем его
      if (chat.user_id === userId) {
        activeChats.delete(chatId);
        chatMessages.delete(chatId);
        
        // Уведомляем всех что чат удален
        io.emit('chat_removed', { chatId });
        console.log(`🗑️ Чат ${chatId} удален (создатель вышел)`);
      }
    }
    
    socket.leave(chatId);
  });
  
  // Индикатор печати
  socket.on('typing_start', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_start', { chatId, userId });
  });
  
  socket.on('typing_stop', (data) => {
    const { chatId, userId } = data;
    socket.to(chatId).emit('typing_stop', { chatId, userId });
  });
  
  // Обработка отключения
  socket.on('disconnect', () => {
    console.log('🔌 User disconnected:', socket.id);
    
    // Удаляем привязку userId при отключении
    if (socket.userId) {
      userSockets.delete(socket.userId);
    }
  });
});

// Очистка старых чатов
setInterval(() => {
  const now = Date.now();
  const hourAgo = now - (60 * 60 * 1000); // 1 час
  
  // Очищаем старые ожидающие чаты
  for (let [chatId, chat] of activeChats.entries()) {
    const chatTime = new Date(chat.created_at).getTime();
    
    if (chatTime < hourAgo) {
      activeChats.delete(chatId);
      chatMessages.delete(chatId);
      io.emit('chat_removed', { chatId });
      console.log(`🗑️ Очищен старый чат: ${chatId}`);
    }
  }
  
  // Очищаем неактивные соединения
  for (let [chatId, chat] of activeConnections.entries()) {
    if (chat.participants_count === 0) {
      activeConnections.delete(chatId);
      chatMessages.delete(chatId);
      console.log(`🗑️ Очищено неактивное соединение: ${chatId}`);
    }
  }
}, 10 * 60 * 1000); // Каждые 10 минут

// Запуск сервера
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Active chats waiting: ${activeChats.size}`);
  console.log(`🔗 Active connections: ${activeConnections.size}`);
  console.log(`🌐 Access the app at: http://localhost:${PORT}`);
});
