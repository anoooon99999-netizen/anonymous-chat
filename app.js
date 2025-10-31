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
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();
let lastChatParams = null;
let socket = null;

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
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: ''
        };
        updateUserInterface(vkUser);
        showNotification('Анонимный режим');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    setInterval(() => {
        if (!currentChat) {
            loadAndRenderChats();
        }
    }, 5000);
}

function updateUserInterface(userInfo) {
    document.getElementById('vkUserName').textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    document.getElementById('vkUserInfo').style.display = 'flex';
    document.getElementById('profileName').textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
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
            console.log('✅ Подключен к серверу');
            if (currentChat) {
                socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
            loadAndRenderChats();
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
                showPartnerLeftModal();
            }
        });
        
        socket.on('chat_activated', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
                showNotification('🎉 Чат активирован! Начинайте общение');
            }
            loadAndRenderChats();
        });
        
        socket.on('typing_start', (data) => {
            if (currentChat && data.chatId === currentChat.id) {
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
        
        // Обработчик нового чата (только для других пользователей)
        socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат от другого пользователя:', chat);
            
            if (chat.creator_id !== vkUser?.id) {
                const newChat = {
                    id: chat.id,
                    gender: chat.user_gender + ', ' + chat.user_age,
                    lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
                    theme: chat.theme,
                    participants_count: chat.participants_count,
                    timestamp: new Date(chat.created_at).getTime(),
                    creator_id: chat.creator_id
                };
                
                allChats.unshift(newChat);
                
                console.log(`🎯 Новый чат добавлен в тему: "${chat.theme}" от пользователя ${chat.creator_id}`);
                
                if (chat.theme === currentTheme) {
                    renderChatsList();
                    showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
                }
            } else {
                console.log('ℹ️ Это мой собственный чат, не добавляем в список');
            }
        });
        
        socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат удален:', data.chatId);
            allChats = allChats.filter(chat => chat.id !== data.chatId);
            renderChatsList();
        });
        
        socket.on('force_refresh_chats', () => {
            console.log('🔄 Принудительное обновление чатов от сервера');
            loadAndRenderChats();
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    document.getElementById('onlineCount').textContent = count + ' онлайн';
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

// Загрузка чатов с сервера (ТОЛЬКО ЧУЖИЕ ЧАТЫ)
window.loadChatsFromServer = async function() {
    try {
        console.log('🌐 Запрос ЧУЖИХ чатов с сервера для пользователя:', vkUser?.id);
        
        const response = await fetch(API_URL + '/api/chats?user_id=' + (vkUser?.id || 'anonymous'));
        if (!response.ok) {
            throw new Error('HTTP error ' + response.status);
        }
        const chats = await response.json();
        console.log('📊 Получено ЧУЖИХ чатов с сервера:', chats.length);
        
        chats.forEach(chat => {
            console.log(`🔍 Чужой чат ${chat.id}: тема="${chat.theme}", создатель=${chat.creator_id}`);
        });
        
        return chats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime(),
            creator_id: chat.creator_id
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    try {
        console.log('🔄 Загрузка и отображение ЧУЖИХ чатов...');
        const chats = await window.loadChatsFromServer();
        allChats = chats;
        renderChatsList();
        
        if (socket) {
            socket.emit('chats_updated', { user_id: vkUser?.id });
        }
    } catch (error) {
        console.error('❌ Ошибка в loadAndRenderChats:', error);
    }
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) return;
    
    container.innerHTML = '';

    const filteredChats = allChats.filter(chat => {
        const matchesTheme = chat.theme === currentTheme;
        const isNotMyChat = chat.creator_id !== vkUser?.id;
        
        console.log(`🔍 Фильтр: "${chat.theme}" === "${currentTheme}": ${matchesTheme}, не мой чат: ${isNotMyChat}`);
        return matchesTheme && isNotMyChat;
    });
    
    console.log(`🎯 Отображаем ЧУЖИЕ чаты для темы "${currentTheme}":`, filteredChats.length);

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
                    ${getTimeAgo(chat.timestamp)}
                </div>
            </div>
        `;
        container.appendChild(chatElement);
    });
}

function openCreateChatModal() {
    console.log('🎯 Открываем модальное окно создания чата');
    document.getElementById('modalTitle').textContent = 'Создать чат для ' + currentTheme;
    document.getElementById('createChatModal').style.display = 'block';
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
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
    console.log('🔍 Начинаем создание чата...');
    
    const myGenderElement = document.querySelector('#myGenderOptions .option-button.active');
    const partnerGenderElement = document.querySelector('#partnerGenderOptions .option-button.active');
    
    if (!myGenderElement || !partnerGenderElement) {
        showNotification('❌ Пожалуйста, выберите пол для себя и собеседника');
        return;
    }
    
    const myGender = myGenderElement.textContent;
    const myAge = document.getElementById('myAge').value;
    const partnerGender = partnerGenderElement.textContent;
    const minAge = document.getElementById('minAge').value;
    const maxAge = document.getElementById('maxAge').value;

    console.log('📊 Данные для создания чата:', { 
        myGender, myAge, partnerGender, minAge, maxAge, theme: currentTheme 
    });

    if (!myAge || myAge < 18 || myAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возраст (18-80)');
        return;
    }

    if (!minAge || !maxAge || minAge >= maxAge || minAge < 18 || maxAge > 80) {
        showNotification('❌ Пожалуйста, введите корректный возрастной диапазон (18-80)');
        return;
    }

    lastChatParams = {
        myGender: myGender,
        myAge: parseInt(myAge),
        partnerGender: partnerGender,
        minAge: parseInt(minAge),
        maxAge: parseInt(maxAge),
        theme: currentTheme
    };

    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: parseInt(myAge),
        partner_gender: partnerGender,
        min_age: parseInt(minAge),
        max_age: parseInt(maxAge),
        theme: currentTheme
    };

    console.log('📨 Отправляем данные на сервер:', chatData);

    try {
        showNotification('⏳ Создаем чат...');
        
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        console.log('📡 Статус ответа:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан успешно:', result);
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            
            showNotification('✅ Чат создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            if (socket) {
                socket.emit('new_chat_created_global');
            }
            
            setTimeout(() => {
                const newChat = {
                    id: result.id,
                    gender: myGender + ', ' + myAge,
                    lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                    theme: currentTheme,
                    participants_count: 1,
                    timestamp: Date.now(),
                    creator_id: vkUser?.id
                };
                startChat(newChat);
            }, 500);
            
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', response.status, errorText);
            showNotification('❌ Ошибка создания чата');
        }
    } catch (error) {
        console.error('❌ Ошибка сети:', error);
        showNotification('❌ Ошибка сети. Проверьте подключение');
    }
}

async function startChat(chat) {
    console.log('🚀 Начинаем чат:', chat.id, 'мой чат:', chat.creator_id === vkUser?.id);
    
    currentChat = null;
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Подключаемся к чату...</div>
                ${chat.creator_id === vkUser?.id ? '<div style="font-size: 14px; margin-top: 8px;">Ожидаем подключения собеседника</div>' : ''}
            </div>
        `;
    }
    
    currentChat = chat;
    document.getElementById('chatRoomTitle').textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    showScreen('chatRoomScreen');
    
    document.body.classList.add('chat-room-active');
    
    if (socket) {
        socket.emit('join_chat', { chatId: chat.id, userId: vkUser?.id });
    }
    
    await loadMessages(chat.id);
    
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) input.focus();
    }, 300);
}

function getChatEmoji(theme) {
    const emojiMap = {
        'Общение': '💬',
        'Флирт': '😊',
        'Роль': '🎭'
    };
    return emojiMap[theme] || '💬';
}

async function loadMessages(chatId) {
    try {
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений');
        }
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
        showNotification('Ошибка загрузки сообщений');
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
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
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
                message: text
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
        } else {
            throw new Error('Ошибка отправки');
        }
    } catch (error) {
        console.error('Ошибка отправки сообщения:', error);
        showNotification('Ошибка отправки сообщения');
    }
}

function closeCreateChatModal() {
    document.getElementById('createChatModal').style.display = 'none';
}

// Функция для переключения опций в модальном окне
function toggleOption(element) {
    const parent = element.parentElement;
    const allOptions = parent.querySelectorAll('.option-button');
    
    allOptions.forEach(btn => {
        btn.classList.remove('active');
    });
    
    element.classList.add('active');
    
    console.log('✅ Выбрана опция:', element.textContent);
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
    
    if (screenId !== 'chatRoomScreen') {
        document.body.classList.remove('chat-room-active');
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
    
    if (screenId !== 'chatRoomScreen' && currentChat && socket) {
        socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
        document.getElementById('typingIndicator').style.display = 'none';
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
    return Math.floor(hours / 24) + ' дн назад';
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
            if (e.target === this) {
                this.style.display = 'none';
            }
        });
    });

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
    }

    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateAgeRange);
        maxSlider.addEventListener('input', updateAgeRange);
    }
}

// Функции для кнопок
function addToFriends() {
    showNotification('✅ Пользователь добавлен в друзья!');
    userStats.friends++;
    saveUserStats();
    updateProfileStats();
}

function reportUser() {
    showNotification('⚠️ Жалоба отправлена модераторам');
}

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
    showNotification('Настройки конфиденциальности в разработке');
}

function openAppInfo() {
    showNotification('Анонимный чат v2.0 для VK');
}

function showPartnerLeftModal() {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'block';
    modal.innerHTML = `
        <div class="modal-content" style="text-align: center; max-width: 300px;">
            <div class="modal-header">
                <div class="modal-title">👤 Собеседник покинул чат</div>
            </div>
            <div style="padding: 20px;">
                <p style="margin-bottom: 20px;">Что вы хотите сделать?</p>
                <div style="display: flex; flex-direction: column; gap: 12px; align-items: center;">
                    <button class="action-button" onclick="recreateChat()" style="width: 100%;">
                        🔄 Создать такой же чат
                    </button>
                    <button class="action-button" onclick="goToChats()" style="width: 100%;">
                        💬 Вернуться к чатам
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function recreateChat() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    
    if (lastChatParams) {
        createChatWithParams(lastChatParams);
    } else {
        showScreen('chatsScreen');
    }
}

function goToChats() {
    const modal = document.querySelector('.modal-overlay');
    if (modal) {
        modal.remove();
    }
    showScreen('chatsScreen');
}

function createChatWithParams(params) {
    if (currentChat && socket) {
        socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = null;
    
    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: params.myGender,
        user_age: params.myAge,
        partner_gender: params.partnerGender,
        min_age: params.minAge,
        max_age: params.maxAge,
        theme: params.theme
    };

    fetch(API_URL + '/api/chats', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatData)
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        return response.json();
    })
    .then(result => {
        console.log('✅ Новый чат создан:', result);
        
        userStats.createdChats++;
        saveUserStats();
        updateProfileStats();
        showNotification('✅ Новый чат создан! Ожидаем собеседника...');
        
        if (socket) {
            socket.emit('new_chat_created_global');
        }
        
        const newChat = {
            id: result.id,
            gender: params.myGender + ', ' + params.myAge,
            lookingFor: params.partnerGender + ', ' + params.minAge + '-' + params.maxAge,
            theme: params.theme,
            participants_count: 1,
            timestamp: Date.now(),
            creator_id: vkUser?.id
        };
        
        startChat(newChat);
    })
    .catch(error => {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата');
        showScreen('chatsScreen');
    });
}

function cancelWaiting() {
    showScreen('chatsScreen');
    showNotification('Поиск собеседника отменен');
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', function() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    
    if (minSlider && maxSlider) {
        minSlider.addEventListener('input', updateAgeRange);
        maxSlider.addEventListener('input', updateAgeRange);
        updateAgeRange();
    }
    
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === this) {
                closeCreateChatModal();
            }
        });
    }
    
    initApp();
});
