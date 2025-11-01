// Конфигурация
const API_URL = window.location.origin;
const SOCKET_URL = window.location.origin;

// Глобальные переменные
let allChats = [];
let userStats = {
    createdChats: 0,
    sentMessages: 0,
    friends: 0,
    daysActive: 1,
    reputation: 150
};
let vkUser = null;
let currentChat = null;
let socket = null;
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();

// Инициализация приложения
async function initApp() {
    try {
        if (typeof vkBridge !== 'undefined') {
            await vkBridge.send('VKWebAppInit');
            isVK = true;
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            vkUser = userInfo;
            updateUserInterface(userInfo);
            showNotification('Добро пожаловать, ' + userInfo.first_name + '!');
        } else {
            throw new Error('VK Bridge not available');
        }
    } catch (error) {
        console.log('Приложение запущено вне VK:', error.message);
        isVK = false;
        vkUser = { 
            id: 'test_user_' + Date.now(), 
            first_name: 'Тест', 
            last_name: 'Пользователь' 
        };
        updateUserInterface(vkUser);
        showNotification('Режим тестирования - можно создавать чаты');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
}

function updateUserInterface(userInfo) {
    document.getElementById('vkUserName').textContent = userInfo.first_name + ' ' + userInfo.last_name;
    document.getElementById('vkUserInfo').style.display = 'flex';
    document.getElementById('profileName').textContent = userInfo.first_name + ' ' + userInfo.last_name;
    document.getElementById('currentAvatar').textContent = userInfo.first_name.charAt(0);
}

// Переключение вкладок чатов
function switchChatTab(theme) {
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    document.getElementById('createChatText').textContent = 'Создать чат для ' + theme;
    renderChatsList();
}

function initSocket() {
    try {
        socket = io(SOCKET_URL);
        socket.on('connect', () => {
            console.log('Connected to server');
            if (currentChat) {
                socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
        });
        
        socket.on('new_message', (message) => {
            if (currentChat && message.chat_id === currentChat.id) {
                addMessageToChat(message);
            }
        });
        
        socket.on('user_joined', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.add(data.userId);
                updateOnlineCount();
                showNotification('👤 Собеседник присоединился к чату');
            }
        });
        
        socket.on('user_left', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers.delete(data.userId);
                updateOnlineCount();
                showNotification('👤 Собеседник покинул чат');
            }
        });
        
        socket.on('chat_activated', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                showNotification('🎉 Чат активирован! Начинайте общение');
            }
        });
        
        socket.on('typing_start', (data) => {
            if (currentChat && data.chatId === currentChat.id && data.userId !== vkUser?.id) {
                document.getElementById('typingIndicator').style.display = 'inline';
            }
        });
        
        socket.on('typing_stop', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                document.getElementById('typingIndicator').style.display = 'none';
            }
        });
        
        socket.on('online_users', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                onlineUsers = new Set(data.users);
                updateOnlineCount();
            }
        });
        
        socket.on('error', (data) => {
            showNotification('❌ ' + data.message);
        });
        
        // ВАЖНО: Обработчик новых чатов от других пользователей
        socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат от другого пользователя:', chat);
            addChatToList(chat);
        });
        
        // 🔥 ВАЖНО: Обработчик удаления чата из списка при заполнении
        socket.on('chat_became_full', (data) => {
            console.log('🚫 Чат заполнен, удаляем из списка:', data.id);
            removeChatFromList(data.id);
        });
        
        // 🔥 ВАЖНО: Обработчик возврата чата в список
        socket.on('chat_became_available', (chat) => {
            console.log('🔄 Чат снова доступен:', chat.id);
            addChatToList(chat);
        });
        
        // 🔥 ВАЖНО: Обработчик выхода участника - показ модального окна создателю
        socket.on('partner_left_chat', (data) => {
            console.log('🎯 Собеседник вышел, показываем окно выбора');
            showPartnerLeftModal(data.chatData);
        });
        
        // 🔥 ВАЖНО: Обработчик возврата на вкладку чатов
        socket.on('redirect_to_chats', () => {
            console.log('🔙 Возвращаем пользователя на вкладку чатов');
            showScreen('chatsScreen');
            showNotification('Вы вышли из чата');
        });
        
        // 🔥 ВАЖНО: Обработчик выхода создателя чата
        socket.on('creator_left_chat', (data) => {
            console.log('👑 Создатель вышел, возвращаем участника');
            showScreen('chatsScreen');
            showNotification('Создатель чата вышел');
        });
        
        // 🔥 ВАЖНО: Обработчик успешного пересоздания чата
        socket.on('chat_recreated', (data) => {
            console.log('🆕 Чат пересоздан:', data.newChatId);
            const newChat = {
                id: data.newChatId,
                gender: data.chatData.user_gender + ', ' + data.chatData.user_age,
                lookingFor: data.chatData.partner_gender + ', ' + data.chatData.min_age + '-' + data.chatData.max_age,
                theme: data.chatData.theme,
                participants_count: 1,
                timestamp: Date.now()
            };
            startChat(newChat);
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

// Функция для удаления чата из списка
function removeChatFromList(chatId) {
    console.log('🗑️ Удаляем чат из списка:', chatId);
    const initialLength = allChats.length;
    allChats = allChats.filter(chat => chat.id !== chatId);
    
    if (allChats.length !== initialLength) {
        console.log('✅ Чат удален из списка');
        renderChatsList();
    }
}

// Функция для показа модального окна при выходе участника
function showPartnerLeftModal(chatData) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.style.zIndex = '1000';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <div class="modal-header">
                <div class="modal-title">Собеседник вышел</div>
            </div>
            <div style="padding: 20px; text-align: center;">
                <div style="font-size: 48px; margin-bottom: 16px;">😔</div>
                <div style="margin-bottom: 20px; color: var(--text-secondary);">
                    Ваш собеседник покинул чат. Что хотите сделать?
                </div>
                <div style="display: flex; gap: 10px; flex-direction: column;">
                    <button class="create-button" onclick="recreateChat(${JSON.stringify(chatData).replace(/"/g, '&quot;')})" style="width: 100%;">
                        Создать такой же чат
                    </button>
                    <button class="action-button" onclick="closeModalAndReturn()" style="width: 100%; background: var(--bg-secondary);">
                        Вернуться к чатам
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // Закрытие при клике вне модального окна
    modal.addEventListener('click', function(e) {
        if (e.target === this) {
            closeModalAndReturn();
        }
    });
}

function recreateChat(chatData) {
    console.log('🔄 Пересоздаем чат с данными:', chatData);
    
    if (socket) {
        socket.emit('recreate_chat', {
            originalChatData: chatData,
            userId: vkUser?.id
        });
    }
    
    // Закрываем модальное окно
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
}

function closeModalAndReturn() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) modal.remove();
    showScreen('chatsScreen');
}

// Функция для добавления чата в список
function addChatToList(chat) {
    const newChat = {
        id: chat.id,
        gender: chat.user_gender + ', ' + chat.user_age,
        lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
        theme: chat.theme,
        participants_count: chat.participants_count || 1,
        timestamp: new Date(chat.created_at).getTime()
    };
    
    // Проверяем, нет ли уже такого чата в списке
    const existingChat = allChats.find(c => c.id === chat.id);
    if (!existingChat) {
        allChats.unshift(newChat);
        console.log('✅ Чат добавлен в список:', newChat);
        
        // Обновляем список если тема совпадает
        if (chat.theme === currentTheme) {
            renderChatsList();
            showNotification('📢 Появился новый чат в разделе "' + chat.theme + '"');
        }
    } else {
        // Обновляем существующий чат
        const index = allChats.findIndex(c => c.id === chat.id);
        allChats[index] = newChat;
        console.log('🔄 Чат обновлен в списке:', newChat);
        renderChatsList();
    }
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    document.getElementById('onlineCount').textContent = count + ' участников онлайн';
}

function handleTyping() {
    if (!currentChat || !socket) return;
    
    socket.emit('typing_start', { 
        chatId: currentChat.id, 
        userId: vkUser?.id 
    });
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        socket.emit('typing_stop', { 
            chatId: currentChat.id, 
            userId: vkUser?.id 
        });
    }, 1000);
}

async function loadChatsFromServer() {
    try {
        const response = await fetch(API_URL + '/api/chats');
        const chats = await response.json();
        return chats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime()
        }));
    } catch (error) {
        console.error('Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    const chats = await loadChatsFromServer();
    allChats = chats;
    renderChatsList();
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    container.innerHTML = '';

    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);

    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                <div>Чатов в разделе "${currentTheme}" пока нет</div>
                <div style="font-size: 14px; margin-top: 8px;">Создайте первый чат!</div>
            </div>
        `;
        return;
    }
    
    filteredChats.forEach(chat => {
        const chatElement = document.createElement('div');
        chatElement.className = 'user-card';
        chatElement.onclick = () => startChat(chat);
        
        chatElement.innerHTML = `
            <div class="user-info">
                <div class="info-row">
                    <span class="info-label">Пол:</span>
                    <span class="info-value">${chat.gender}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Ищу:</span>
                    <span class="info-value">${chat.lookingFor}</span>
                </div>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="theme-tag">${chat.theme}</div>
                <div style="font-size: 12px; color: var(--text-secondary);">
                    ${chat.participants_count}/2 • ${getTimeAgo(chat.timestamp)}
                </div>
            </div>
        `;
        container.appendChild(chatElement);
    });
}

function openCreateChatModal() {
    document.getElementById('modalTitle').textContent = 'Создать чат для ' + currentTheme;
    document.getElementById('createChatModal').style.display = 'block';
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxSlider');
    
    let minAge = parseInt(minSlider.value);
    let maxAge = parseInt(maxSlider.value);
    
    if (minAge > maxAge) {
        minAge = maxAge;
        minSlider.value = minAge;
    }
    
    document.getElementById('minAgeValue').textContent = minAge;
    document.getElementById('maxAgeValue').textContent = maxAge;
    
    document.getElementById('minAge').value = minAge;
    document.getElementById('maxAge').value = maxAge;
}

async function createChat() {
    console.log('Создание чата...');
    
    const myGender = document.querySelector('#myGenderOptions .option-button.active').textContent;
    const myAge = document.getElementById('myAge').value;
    const partnerGender = document.querySelector('#partnerGenderOptions .option-button.active').textContent;
    const minAge = document.getElementById('minAge').value;
    const maxAge = document.getElementById('maxAge').value;

    if (!myAge || myAge < 18 || myAge > 80) {
        showNotification('Пожалуйста, введите корректный возраст (18-80)');
        return;
    }

    if (!minAge || !maxAge || minAge >= maxAge || minAge < 18 || maxAge > 80) {
        showNotification('Пожалуйста, введите корректный возрастной диапазон (18-80)');
        return;
    }

    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: parseInt(myAge),
        partner_gender: partnerGender,
        min_age: parseInt(minAge),
        max_age: parseInt(maxAge),
        theme: currentTheme
    };

    console.log('Отправка данных:', chatData);

    try {
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан:', result);
            
            // Добавляем свой чат в список
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                participants_count: 1,
                timestamp: Date.now()
            };
            
            addChatToList({
                id: result.id,
                user_gender: myGender,
                user_age: parseInt(myAge),
                partner_gender: partnerGender,
                min_age: parseInt(minAge),
                max_age: parseInt(maxAge),
                theme: currentTheme,
                participants_count: 1,
                created_at: new Date().toISOString()
            });
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            showNotification('✅ Чат успешно создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            // Автоматически переходим в созданный чат
            setTimeout(() => startChat(newChat), 500);
            
        } else {
            throw new Error('Ошибка сервера: ' + response.status);
        }
    } catch (error) {
        console.error('Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
    }
}

async function startChat(chat) {
    currentChat = chat;
    document.getElementById('chatRoomTitle').textContent = 'Чат: ' + chat.theme;
    showScreen('chatRoomScreen');
    
    document.body.classList.add('chat-room-active');
    
    if (socket) {
        socket.emit('join_chat', { 
            chatId: chat.id, 
            userId: vkUser?.id,
            userData: {
                name: vkUser?.first_name + ' ' + vkUser?.last_name,
                gender: chat.gender?.split(',')[0]?.trim()
            }
        });
    }
    
    await loadMessages(chat.id);
    
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

async function loadMessages(chatId) {
    try {
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        const messages = await response.json();
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        
        if (messages.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                    <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                    <div>Пока нет сообщений</div>
                    <div style="font-size: 14px; margin-top: 8px;">Начните общение первым!</div>
                </div>
            `;
            return;
        }
        
        messages.forEach(msg => {
            addMessageToChat(msg);
        });
        
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        console.error('Ошибка загрузки сообщений:', error);
    }
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    
    if (container.innerHTML.includes('Пока нет сообщений')) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isMyMessage = message.user_id === (vkUser?.id || 'anonymous');
    messageElement.className = 'message ' + (isMyMessage ? 'message-my' : 'message-their');
    
    let messageContent = `
        <div class="message-content">${message.message}</div>
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString()}</div>
    `;
    
    if (!isMyMessage) {
        messageContent = `
            <div class="message-sender">${message.user_name || 'Аноним'}</div>
            ${messageContent}
        `;
    }
    
    messageElement.innerHTML = messageContent;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    const text = input.value.trim();
    
    if (!text || !currentChat) return;

    try {
        const response = await fetch(API_URL + '/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                },
            body: JSON.stringify({
                chat_id: currentChat.id,
                user_id: vkUser?.id || 'anonymous',
                message: text,
                user_name: vkUser ? vkUser.first_name + ' ' + vkUser.last_name : 'Аноним'
            })
        });
        
        if (response.ok) {
            input.value = '';
            userStats.sentMessages++;
            saveUserStats();
            updateProfileStats();
            
            if (socket) {
                socket.emit('typing_stop', { 
                    chatId: currentChat.id, 
                    userId: vkUser?.id 
                });
            }
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения');
    }
}

// 🔥 ВАЖНО: Обновленная функция выхода из чата
function leaveChat() {
    if (!currentChat || !socket) return;
    
    const isCreator = currentChat.creator_id === vkUser?.id;
    
    socket.emit('leave_chat', { 
        chatId: currentChat.id, 
        userId: vkUser?.id,
        isCreator: isCreator
    });
    
    currentChat = null;
    showScreen('chatsScreen');
}

function closeCreateChatModal() {
    document.getElementById('createChatModal').style.display = 'none';
}

function toggleOption(element) {
    const parent = element.parentElement;
    parent.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    if (screenId !== 'chatRoomScreen') {
        document.body.classList.remove('chat-room-active');
        // При переходе с экрана чата - выходим из чата
        if (currentChat && socket) {
            const isCreator = currentChat.creator_id === vkUser?.id;
            socket.emit('leave_chat', { 
                chatId: currentChat.id, 
                userId: vkUser?.id,
                isCreator: isCreator
            });
            document.getElementById('typingIndicator').style.display = 'none';
        }
    } else {
        document.body.classList.add('chat-room-active');
    }
    
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    const menuMap = {
        'chatsScreen': 0,
        'profileScreen': 1,
        'settingsScreen': 2
    };
    
    if (menuMap[screenId] !== undefined) {
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems[menuMap[screenId]].classList.add('active');
    }
}

function loadUserStats() {
    const savedStats = localStorage.getItem('user_stats');
    if (savedStats) {
        userStats = JSON.parse(savedStats);
    }
    
    const firstVisit = localStorage.getItem('first_visit');
    if (!firstVisit) {
        localStorage.setItem('first_visit', Date.now());
    } else {
        const days = Math.floor((Date.now() - parseInt(firstVisit)) / (1000 * 60 * 60 * 24));
        userStats.daysActive = Math.max(1, days);
    }
}

function saveUserStats() {
    localStorage.setItem('user_stats', JSON.stringify(userStats));
}

function updateProfileStats() {
    document.getElementById('chatsCount').textContent = userStats.createdChats;
    document.getElementById('messagesCount').textContent = userStats.sentMessages;
    document.getElementById('friendsCount').textContent = userStats.friends;
    document.getElementById('daysCount').textContent = userStats.daysActive;
    document.getElementById('profileReputation').textContent = userStats.reputation;
}

function getTimeAgo(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    if (minutes < 1) return 'только что';
    if (minutes < 60) return minutes + ' мин назад';
    if (hours < 24) return hours + ' ч назад';
    return Math.floor(diff / 86400000) + ' дн назад';
}

function showNotification(message) {
    const existingSnackbars = document.querySelectorAll('.snackbar');
    existingSnackbars.forEach(snackbar => snackbar.remove());
    
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    
    setTimeout(() => {
        snackbar.remove();
    }, 3000);
}

function setupEventListeners() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', function(e) {
            if (e.target === this) this.style.display = 'none';
        });
    });

    document.getElementById('messageInput')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
}

// Функции для чата
function addToFriends() {
    showNotification('✅ Пользователь добавлен в друзья!');
    userStats.friends++;
    saveUserStats();
    updateProfileStats();
}

function reportUser() {
    showNotification('⚠️ Жалоба отправлена модераторам');
}

// Простые функции для кнопок
function enableNotifications() {
    showNotification('🔔 Уведомления включены!');
}

function openMyChats() {
    const myChatsCount = allChats.filter(chat => chat.userId === vkUser?.id).length;
    if (myChatsCount > 0) {
        showNotification(`У вас ${myChatsCount} активных чатов`);
    } else {
        showNotification('У вас пока нет активных чатов');
    }
}

function shareApp() {
    showNotification('Поделитесь приложением с друзьями!');
}

function inviteFriends() {
    showNotification('Пригласите друзей в приложение!');
}

function addToFavorites() {
    showNotification('✅ Добавлено в избранное!');
}

function support() {
    showNotification('Напишите нам в сообщения группы VK');
}

function openNotificationsSettings() {
    showNotification('Настройки уведомлений в разработке');
}

function openPrivacySettings() {
    showNotification('Настройки приватности в разработке');
}

function openAppInfo() {
    showNotification('Анонимный чат v2.0 для VK');
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', initApp);
