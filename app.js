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

// Инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
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
        showNotification('Анонимный режим - можно создавать чаты');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    console.log('✅ Приложение инициализировано');
}

function updateUserInterface(userInfo) {
    const userNameElement = document.getElementById('vkUserName');
    const userInfoElement = document.getElementById('vkUserInfo');
    const profileNameElement = document.getElementById('profileName');
    const currentAvatarElement = document.getElementById('currentAvatar');
    
    if (userNameElement) {
        userNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (userInfoElement) {
        userInfoElement.style.display = 'flex';
    }
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

// Переключение вкладок чатов
function switchChatTab(theme) {
    console.log('🔄 Переключение на вкладку:', theme);
    
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    event.target.classList.add('active');
    
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = 'Создать чат для ' + theme;
    }
    
    renderChatsList();
}

function initSocket() {
    try {
        if (!window.socket) {
            console.error('Socket.io не инициализирован');
            return;
        }
        
        window.socket.on('connect', () => {
            console.log('✅ Connected to server');
            if (currentChat) {
                window.socket.emit('join_chat', { chatId: currentChat.id, userId: vkUser?.id });
            }
        });
        
        window.socket.on('new_chat_created', (chat) => {
            console.log('📨 Получен новый чат через socket:', chat);
            addChatToList(chat);
        });
        
        window.socket.on('chat_removed', (data) => {
            console.log('🗑️ Чат удален:', data.chatId);
            removeChatFromList(data.chatId);
        });
        
    } catch (error) {
        console.error('Socket error:', error);
    }
}

// Функции для работы с чатами
function addChatToList(chat) {
    console.log('➕ Добавляем чат в список:', chat);
    
    const newChat = {
        id: chat.id || chat.chatId,
        gender: (chat.user_gender || 'Не указан') + ', ' + (chat.user_age || '?'),
        lookingFor: (chat.partner_gender || 'Любой') + ', ' + (chat.min_age || '18') + '-' + (chat.max_age || '80'),
        theme: chat.theme || 'Общение',
        participants_count: chat.participants_count || 1,
        timestamp: chat.created_at ? new Date(chat.created_at).getTime() : Date.now(),
        userId: chat.user_id || 'anonymous'
    };
    
    // Проверяем, нет ли уже такого чата
    const existingChatIndex = allChats.findIndex(c => c.id === newChat.id);
    if (existingChatIndex === -1) {
        allChats.unshift(newChat);
        console.log('✅ Чат добавлен в allChats. Всего чатов:', allChats.length);
        
        // Сразу обновляем отображение если это текущая тема
        if (newChat.theme === currentTheme) {
            console.log('🎨 Обновляем отображение для темы:', currentTheme);
            renderChatsList();
            if (newChat.userId !== vkUser?.id) {
                showNotification('📢 Создан новый чат в разделе "' + newChat.theme + '"');
            }
        }
    } else {
        console.log('⚠️ Чат уже существует в списке');
    }
}

function removeChatFromList(chatId) {
    allChats = allChats.filter(chat => chat.id !== chatId);
    console.log('🗑️ Чат удален из списка:', chatId);
    renderChatsList();
}

// Загрузка чатов с сервера
window.loadChatsFromServer = async function() {
    try {
        console.log('📡 Загрузка чатов с сервера...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        
        const chats = await response.json();
        console.log('✅ Загружено чатов с сервера:', chats.length);
        
        return chats.map(chat => ({
            id: chat.id,
            gender: chat.user_gender + ', ' + chat.user_age,
            lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
            theme: chat.theme,
            participants_count: chat.participants_count,
            timestamp: new Date(chat.created_at).getTime(),
            userId: chat.user_id
        }));
    } catch (error) {
        console.error('❌ Ошибка загрузки чатов:', error);
        showNotification('Ошибка загрузки чатов');
        return [];
    }
}

async function loadAndRenderChats() {
    console.log('🔄 Загрузка и отрисовка чатов...');
    const chats = await window.loadChatsFromServer();
    allChats = chats;
    console.log('📊 Всего чатов после загрузки:', allChats.length);
    renderChatsList();
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) {
        console.error('❌ Контейнер чатов не найден');
        return;
    }
    
    console.log('🎨 Начинаем отрисовку чатов...');
    console.log('📋 Всего чатов в allChats:', allChats.length);
    console.log('🎯 Текущая тема:', currentTheme);
    
    const filteredChats = allChats.filter(chat => {
        const matches = chat.theme === currentTheme;
        console.log(`Чат ${chat.id}: "${chat.theme}" === "${currentTheme}" -> ${matches}`);
        return matches;
    });
    
    console.log(`📊 Отфильтровано чатов для "${currentTheme}":`, filteredChats.length);

    container.innerHTML = '';

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
    
    filteredChats.forEach((chat, index) => {
        console.log(`Создаем элемент чата ${index + 1}:`, chat);
        
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
    
    console.log('✅ Отрисовка завершена. Добавлено элементов:', filteredChats.length);
}

// Модальное окно создания чата
function openCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    const modalTitle = document.getElementById('modalTitle');
    
    if (modal && modalTitle) {
        modalTitle.textContent = 'Создать чат для ' + currentTheme;
        modal.style.display = 'block';
    }
}

function closeCreateChatModal() {
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    const minAgeValue = document.getElementById('minAgeValue');
    const maxAgeValue = document.getElementById('maxAgeValue');
    const minAgeInput = document.getElementById('minAge');
    const maxAgeInput = document.getElementById('maxAge');
    
    if (!minSlider || !maxSlider || !minAgeValue || !maxAgeValue) return;
    
    let minAge = parseInt(minSlider.value);
    let maxAge = parseInt(maxSlider.value);
    
    if (minAge > maxAge) {
        minAge = maxAge;
        minSlider.value = minAge;
    }
    
    minAgeValue.textContent = minAge;
    maxAgeValue.textContent = maxAge;
    
    if (minAgeInput) minAgeInput.value = minAge;
    if (maxAgeInput) maxAgeInput.value = maxAge;
}

async function createChat() {
    console.log('🔍 Начинаем создание чата...');
    
    const myGenderElement = document.querySelector('#myGenderOptions .option-button.active');
    const myAgeElement = document.getElementById('myAge');
    const partnerGenderElement = document.querySelector('#partnerGenderOptions .option-button.active');
    const minAgeElement = document.getElementById('minAge');
    const maxAgeElement = document.getElementById('maxAge');

    if (!myGenderElement || !myAgeElement || !partnerGenderElement || !minAgeElement || !maxAgeElement) {
        showNotification('❌ Ошибка: не все поля заполнены');
        return;
    }

    const myGender = myGenderElement.textContent;
    const myAge = parseInt(myAgeElement.value);
    const partnerGender = partnerGenderElement.textContent;
    const minAge = parseInt(minAgeElement.value);
    const maxAge = parseInt(maxAgeElement.value);

    console.log('📊 Данные для создания чата:', { myGender, myAge, partnerGender, minAge, maxAge, theme: currentTheme });

    // Валидация
    if (!myGender || !partnerGender) {
        showNotification('❌ Пожалуйста, выберите пол');
        return;
    }

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
        myAge: myAge,
        partnerGender: partnerGender,
        minAge: minAge,
        maxAge: maxAge,
        theme: currentTheme
    };

    const chatData = {
        user_id: vkUser?.id || 'anonymous',
        user_gender: myGender,
        user_age: myAge,
        partner_gender: partnerGender,
        min_age: minAge,
        max_age: maxAge,
        theme: currentTheme
    };

    console.log('📨 Отправляем данные на сервер:', chatData);

    try {
        const response = await fetch(API_URL + '/api/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatData)
        });
        
        console.log('📡 Ответ сервера:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('✅ Чат создан на сервере:', result);
            
            // ВАЖНО: Создаем объект чата и сразу добавляем его
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                participants_count: 1,
                timestamp: Date.now(),
                userId: vkUser?.id || 'anonymous'
            };
            
            console.log('➕ Добавляем чат в allChats:', newChat);
            
            // КРИТИЧНО: Добавляем чат в массив allChats
            allChats.unshift(newChat);
            console.log('✅ Чат добавлен в allChats. Теперь всего чатов:', allChats.length);
            
            // КРИТИЧНО: Сразу обновляем отображение
            renderChatsList();
            
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            showNotification('✅ Чат успешно создан! Ожидаем собеседника...');
            closeCreateChatModal();
            
            // Переходим к чату
            setTimeout(() => startChat(newChat), 500);
            
        } else {
            const errorText = await response.text();
            console.error('❌ Ошибка сервера:', errorText);
            throw new Error('Ошибка сервера: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
    }
}

// Работа с чатом
async function startChat(chat) {
    console.log('💬 Запуск чата:', chat.id);
    
    if (currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
    
    currentChat = chat;
    
    const chatRoomTitle = document.getElementById('chatRoomTitle');
    if (chatRoomTitle) {
        chatRoomTitle.textContent = getChatEmoji(chat.theme) + ' ' + chat.theme;
    }
    
    showScreen('chatRoomScreen');
    
    const messagesContainer = document.getElementById('messagesContainer');
    if (messagesContainer) {
        messagesContainer.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💭</div>
                <div>Загружаем чат...</div>
            </div>
        `;
    }
    
    if (window.socket) {
        window.socket.emit('join_chat', { chatId: chat.id, userId: vkUser?.id });
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
        console.log('📨 Загрузка сообщений для чата:', chatId);
        const response = await fetch(API_URL + '/api/messages?chat_id=' + chatId);
        
        if (!response.ok) {
            throw new Error('Ошибка загрузки сообщений: ' + response.status);
        }
        
        const messages = await response.json();
        console.log('✅ Загружено сообщений:', messages.length);
        
        const container = document.getElementById('messagesContainer');
        if (!container) return;
        
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
        console.error('❌ Ошибка загрузки сообщений:', error);
        showNotification('Ошибка загрузки сообщений');
    }
}

function addMessageToChat(message) {
    const container = document.getElementById('messagesContainer');
    if (!container) return;
    
    if (container.innerHTML.includes('Пока нет сообщений')) {
        container.innerHTML = '';
    }
    
    const messageElement = document.createElement('div');
    const isMyMessage = message.user_id === (vkUser?.id || 'anonymous');
    messageElement.className = 'message ' + (isMyMessage ? 'message-my' : 'message-their');
    
    const messageContent = `
        <div class="message-content">${escapeHtml(message.message)}</div>
        <div class="message-time">${new Date(message.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
    `;
    
    messageElement.innerHTML = messageContent;
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    const input = document.getElementById('messageInput');
    if (!input) return;
    
    const text = input.value.trim();
    
    if (!text || !currentChat) {
        return;
    }

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
            
            if (window.socket) {
                window.socket.emit('typing_stop', { 
                    chatId: currentChat.id, 
                    userId: vkUser?.id 
                });
            }
        } else {
            throw new Error('Ошибка отправки: ' + response.status);
        }
    } catch (error) {
        console.error('❌ Ошибка отправки сообщения:', error);
        showNotification('❌ Ошибка отправки сообщения');
    }
}

// Навигация
function showScreen(screenId) {
    console.log('🔄 Переключение на экран:', screenId);
    
    document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    updateMenuActiveState(screenId);
    toggleBottomMenu(screenId);
    
    if (screenId !== 'chatRoomScreen' && currentChat && window.socket) {
        window.socket.emit('leave_chat', { chatId: currentChat.id, userId: vkUser?.id });
    }
}

function updateMenuActiveState(screenId) {
    const menuItems = document.querySelectorAll('.bottom-menu .menu-item');
    menuItems.forEach(item => item.classList.remove('active'));
    
    const menuIndex = {
        'chatsScreen': 0,
        'profileScreen': 1,
        'settingsScreen': 2
    }[screenId];
    
    if (menuIndex !== undefined && menuItems[menuIndex]) {
        menuItems[menuIndex].classList.add('active');
    }
}

function toggleBottomMenu(screenId) {
    const bottomMenu = document.querySelector('.bottom-menu');
    if (bottomMenu) {
        if (screenId === 'chatRoomScreen' || screenId === 'waitingScreen') {
            bottomMenu.style.display = 'none';
        } else {
            bottomMenu.style.display = 'flex';
        }
    }
}

// Утилиты
function toggleOption(element) {
    if (!element) return;
    
    const parent = element.parentElement;
    if (!parent) return;
    
    parent.querySelectorAll('.option-button').forEach(btn => btn.classList.remove('active'));
    element.classList.add('active');
}

function loadUserStats() {
    try {
        const savedStats = localStorage.getItem('user_stats');
        if (savedStats) {
            userStats = JSON.parse(savedStats);
        }
        
        const firstVisit = localStorage.getItem('first_visit');
        if (!firstVisit) {
            localStorage.setItem('first_visit', Date.now().toString());
        } else {
            const days = Math.floor((Date.now() - parseInt(firstVisit)) / (1000 * 60 * 60 * 24));
            userStats.daysActive = Math.max(1, days);
        }
    } catch (error) {
        console.error('❌ Ошибка загрузки статистики:', error);
    }
}

function saveUserStats() {
    try {
        localStorage.setItem('user_stats', JSON.stringify(userStats));
    } catch (error) {
        console.error('❌ Ошибка сохранения статистики:', error);
    }
}

function updateProfileStats() {
    const elements = {
        'chatsCount': userStats.createdChats,
        'messagesCount': userStats.sentMessages,
        'friendsCount': userStats.friends,
        'daysCount': userStats.daysActive,
        'profileReputation': userStats.reputation
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    });
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
    existingSnackbars.forEach(snackbar => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    });
    
    const snackbar = document.createElement('div');
    snackbar.className = 'snackbar';
    snackbar.textContent = message;
    document.body.appendChild(snackbar);
    
    setTimeout(() => {
        if (snackbar.parentNode) {
            snackbar.remove();
        }
    }, 3000);
}

function setupEventListeners() {
    console.log('🔧 Настройка обработчиков событий...');
    
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
    
    updateAgeRange();
}

// Запуск приложения
document.addEventListener('DOMContentLoaded', function() {
    console.log('📄 DOM загружен, запускаем приложение...');
    initApp();
});

// Глобальные функции для HTML
window.switchChatTab = switchChatTab;
window.openCreateChatModal = openCreateChatModal;
window.closeCreateChatModal = closeCreateChatModal;
window.toggleOption = toggleOption;
window.createChat = createChat;
window.showScreen = showScreen;
window.sendMessage = sendMessage;
window.handleTyping = handleTyping;

// Функции для отладки
window.debugChats = function() {
    console.log('🐛 ДЕБАГ ЧАТОВ:');
    console.log('Всего чатов в allChats:', allChats.length);
    console.log('Текущая тема:', currentTheme);
    console.log('Все чаты:', allChats);
    
    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);
    console.log('Отфильтрованные чаты:', filteredChats);
};

window.forceReloadChats = async function() {
    console.log('🔄 Принудительная перезагрузка чатов');
    await loadAndRenderChats();
};
