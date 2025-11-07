// Конфигурация для онлайн работы
const API_URL = "https://anonymous-chat-mvgx.onrender.com";
const SOCKET_URL = "https://anonymous-chat-mvgx.onrender.com";

// Глобальные переменные
let allChats = [];
let userStats = {
    createdChats: 0,
    sentMessages: 0,
    friends: 0,
    daysActive: 1,
    reputation: 150
};
let isVK = false;
let currentTheme = 'Общение';
let typingTimer = null;
let onlineUsers = new Set();
let lastChatParams = null;
let shownModals = new Set();

// ===== СИСТЕМА ТЕМ =====
let currentAppTheme = 'system';

function initThemeSystem() {
    // Загружаем сохраненную тему
    const savedTheme = localStorage.getItem('app_theme');
    if (savedTheme) {
        currentAppTheme = savedTheme;
    } else {
        // Автоопределение системной темы
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        currentAppTheme = 'system';
    }
    
    applyTheme(currentAppTheme);
    updateThemeText();
}

function applyTheme(theme) {
    currentAppTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app_theme', theme);
    updateThemeText();
}

function updateThemeText() {
    const themeText = document.getElementById('currentThemeText');
    if (themeText) {
        const themeNames = {
            'system': 'Системная',
            'light': 'Светлая',
            'dark': 'Темная', 
            'space': 'Космическая',
            'purple': 'Фиолетовая'
        };
        themeText.textContent = themeNames[currentAppTheme] || 'Системная';
    }
}

function openThemeSettings() {
    const modal = document.getElementById('themeModal');
    if (modal) {
        modal.style.display = 'block';
        updateThemeSelection();
    }
}

function closeThemeModal() {
    const modal = document.getElementById('themeModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function selectTheme(theme) {
    applyTheme(theme);
    updateThemeSelection();
    showNotification(`✅ Тема изменена на "${getThemeName(theme)}"`);
}

function getThemeName(theme) {
    const names = {
        'system': 'Системная',
        'light': 'Светлая',
        'dark': 'Темная',
        'space': 'Космическая', 
        'purple': 'Фиолетовая'
    };
    return names[theme] || theme;
}

function updateThemeSelection() {
    // Убираем активный класс у всех опций
    document.querySelectorAll('.theme-option').forEach(option => {
        option.classList.remove('active');
    });
    
    // Показываем галочку только у выбранной темы
    document.querySelectorAll('.theme-check').forEach(check => {
        check.style.opacity = '0';
    });
    
    // Активируем выбранную тему
    const selectedOption = document.querySelector(`.theme-option[data-theme="${currentAppTheme}"]`);
    if (selectedOption) {
        selectedOption.classList.add('active');
        const check = selectedOption.querySelector('.theme-check');
        if (check) {
            check.style.opacity = '1';
        }
    }
}

// Принудительная загрузка Socket.io если не загружен
function loadSocketIO() {
    return new Promise((resolve) => {
        if (typeof io !== 'undefined') {
            console.log('✅ Socket.io уже загружен');
            resolve();
            return;
        }

        console.log('🔄 Загружаем Socket.io...');
        const script = document.createElement('script');
        script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
        script.onload = () => {
            console.log('✅ Socket.io загружен');
            resolve();
        };
        script.onerror = () => {
            console.error('❌ Ошибка загрузки Socket.io');
            resolve(); // Продолжаем без socket.io
        };
        document.head.appendChild(script);
    });
}

// Инициализация Socket.io подключения
function initSocketConnection() {
    try {
        if (typeof io === 'undefined') {
            console.error('❌ Socket.io не доступен');
            return;
        }

        console.log('🔌 Инициализация Socket.io подключения...');
        window.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            timeout: 10000
        });
        
        window.socket.on('connect', () => {
            console.log('✅ Подключен к серверу чатов');
            // Сообщаем серверу наш userId при подключении
            if (window.vkUser?.id) {
                window.socket.emit('set_user_id', window.vkUser.id);
            }
        });
        
        window.socket.on('disconnect', (reason) => {
            console.log('❌ Отключен от сервера:', reason);
        });
        
        window.socket.on('connect_error', (error) => {
            console.error('❌ Ошибка подключения Socket.io:', error);
        });

        // Настраиваем обработчики событий
        setupSocketHandlers();
        
    } catch (error) {
        console.error('❌ Ошибка инициализации Socket.io:', error);
    }
}

// Настройка обработчиков Socket.io
function setupSocketHandlers() {
    if (!window.socket) return;

    // Получение истории сообщений от сервера
    window.socket.on('chat_messages', (data) => {
        console.log('📨 Получена история сообщений:', data.messages.length);
        if (window.currentChat && data.chatId === window.currentChat.id) {
            renderMessages(data.messages);
        }
    });
    
    // Слушаем создание новых чатов от всех пользователей
    window.socket.on('new_chat_created', (chat) => {
        console.log('📨 Получен новый чат от другого пользователя:', chat);
        
        const isMyChat = chat.user_id === window.vkUser?.id;
        const existingChatIndex = allChats.findIndex(c => c.id === chat.id);
        
        if (existingChatIndex === -1) {
            addChatToList(chat);
            
            if (!isMyChat) {
                showNotification('📢 Создан новый чат в разделе "' + chat.theme + '"');
            }
        }
    });
    
    // Слушаем когда чат активируется (найден второй участник)
    window.socket.on('chat_activated', (data) => {
        console.log('🎉 Чат активирован:', data.chatId);
        removeChatFromList(data.chatId);
        
        if (window.currentChat && data.chatId === window.currentChat.id) {
            showNotification(data.message || '💬 Найден собеседник! Чат активирован');
            onlineUsers = new Set([window.vkUser?.id, 'partner']);
            updateOnlineCount();
        }
    });
    
    // Слушаем когда чат полностью удаляется с сервера
    window.socket.on('chat_removed', (data) => {
        console.log('🗑️ Чат полностью удален с сервера:', data.chatId);
        removeChatFromList(data.chatId);
    });
    
    window.socket.on('user_joined', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.add(data.userId);
            updateOnlineCount();
            showNotification('👤 Собеседник присоединился к чату');
        }
    });
    
    window.socket.on('user_left', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers.delete(data.userId);
            updateOnlineCount();
            
            const isCreator = window.currentChat.userId === window.vkUser?.id;
            const isSelfLeave = data.userId === window.vkUser?.id;
            
            console.log('🚪 Пользователь вышел из чата:', {
                chatId: data.chatId,
                userId: data.userId,
                isCreator: isCreator,
                isSelfLeave: isSelfLeave
            });
            
            if (!isSelfLeave && isCreator) {
                showPartnerLeftModal(data.chatId);
            }
        }
    });
    
    window.socket.on('new_message', (message) => {
        if (window.currentChat && message.chat_id === window.currentChat.id) {
            addMessageToChat(message);
        }
    });
    
    window.socket.on('typing_start', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'inline';
            }
        }
    });
    
    window.socket.on('typing_stop', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            const typingIndicator = document.getElementById('typingIndicator');
            if (typingIndicator) {
                typingIndicator.style.display = 'none';
            }
        }
    });
    
    window.socket.on('online_users', (data) => {
        if (window.currentChat && data.chatId === window.currentChat.id) {
            onlineUsers = new Set(data.users);
            updateOnlineCount();
        }
    });
    
    window.socket.on('error', (data) => {
        showNotification('❌ ' + data.message);
    });
}

// Инициализация приложения
async function initApp() {
    console.log('🚀 Инициализация приложения...');
    
    try {
        if (typeof vkBridge !== 'undefined') {
            await vkBridge.send('VKWebAppInit');
            isVK = true;
            const userInfo = await vkBridge.send('VKWebAppGetUserInfo');
            window.vkUser = userInfo;
            updateUserInterface(userInfo);
            showNotification('Добро пожаловать, ' + userInfo.first_name + '!');
        } else {
            throw new Error('VK Bridge not available');
        }
    } catch (error) {
        console.log('Приложение запущено вне VK:', error.message);
        isVK = false;
        window.vkUser = { 
            id: 'user_' + Math.random().toString(36).substr(2, 9),
            first_name: 'Аноним',
            last_name: ''
        };
        updateUserInterface(window.vkUser);
        showNotification('Анонимный режим - можно создавать чаты');
    }

    // Инициализация системы тем
    initThemeSystem();
    
    // Загружаем и инициализируем Socket.io
    await loadSocketIO();
    initSocketConnection();
    
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    
    console.log('✅ Приложение инициализировано');
}

function updateUserInterface(userInfo) {
    const profileNameElement = document.getElementById('profileName');
    const currentAvatarElement = document.getElementById('currentAvatar');
    
    if (profileNameElement) {
        profileNameElement.textContent = userInfo.first_name + (userInfo.last_name ? ' ' + userInfo.last_name : '');
    }
    
    if (currentAvatarElement) {
        currentAvatarElement.textContent = userInfo.first_name.charAt(0);
    }
}

// Переключение вкладок чатов
function switchChatTab(theme, element) {
    console.log('🔄 Переключение на вкладку:', theme);
    
    currentTheme = theme;
    
    document.querySelectorAll('.chat-tab').forEach(tab => tab.classList.remove('active'));
    element.classList.add('active');
    
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = 'Создать чат для ' + theme;
    }
    
    renderChatsList();
}

// Функции для работы с чатами
function addChatToList(chat) {
    console.log('➕ Добавляем чат в список:', chat);
    
    const newChat = {
        id: chat.id,
        gender: chat.user_gender + ', ' + chat.user_age,
        lookingFor: chat.partner_gender + ', ' + chat.min_age + '-' + chat.max_age,
        theme: chat.theme,
        participants_count: chat.participants_count || 1,
        timestamp: new Date(chat.created_at).getTime(),
        userId: chat.user_id
    };
    
    // Удаляем возможный дубликат
    allChats = allChats.filter(c => c.id !== newChat.id);
    
    // Добавляем в начало списка
    allChats.unshift(newChat);
    console.log('✅ Чат добавлен в allChats. Всего чатов:', allChats.length);
    
    // Немедленно обновляем интерфейс если это текущая тема
    if (newChat.theme === currentTheme) {
        console.log('🎨 Обновляем отображение для темы:', currentTheme);
        renderChatsList();
    }
}

function removeChatFromList(chatId) {
    const initialLength = allChats.length;
    allChats = allChats.filter(chat => chat.id !== chatId);
    console.log('🗑️ Чат удален из списка:', chatId, 'Было:', initialLength, 'Стало:', allChats.length);
    renderChatsList();
}

function updateOnlineCount() {
    const count = onlineUsers.size;
    const onlineCountElement = document.getElementById('onlineCount');
    if (onlineCountElement) {
        if (count === 1) {
            onlineCountElement.textContent = '1 участник • Ожидаем собеседника';
            onlineCountElement.style.color = 'var(--warning)';
        } else if (count === 2) {
            onlineCountElement.textContent = '2 участника • Чат активен';
            onlineCountElement.style.color = 'var(--success)';
        } else {
            onlineCountElement.textContent = count + ' онлайн';
            onlineCountElement.style.color = 'var(--text-secondary)';
        }
    }
}

function handleTyping() {
    if (!window.currentChat || !window.socket) return;
    
    window.socket.emit('typing_start', { 
        chatId: window.currentChat.id, 
        userId: window.vkUser?.id 
    });
    
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        window.socket.emit('typing_stop', { 
            chatId: window.currentChat.id, 
            userId: window.vkUser?.id 
        });
    }, 1000);
}

// Загрузка чатов с сервера
window.loadChatsFromServer = async function() {
    try {
        console.log('📡 Загрузка активных чатов с сервера...');
        const response = await fetch(API_URL + '/api/chats');
        
        if (!response.ok) {
            throw new Error('Ошибка сервера: ' + response.status);
        }
        
        const chats = await response.json();
        console.log('✅ Загружено чатов с сервера:', chats.length);
        
        const activeChats = chats.filter(chat => chat.participants_count === 1);
        console.log('🎯 Активных чатов (participants_count = 1):', activeChats.length);
        
        return activeChats.map(chat => ({
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
    console.log('🔄 Загрузка и отрисовка активных чатов...');
    const chats = await window.loadChatsFromServer();
    allChats = chats;
    console.log('📊 Активных чатов после загрузки:', allChats.length);
    renderChatsList();
}

function renderChatsList() {
    const container = document.getElementById('chatsContainer');
    if (!container) {
        console.error('❌ Контейнер чатов не найден');
        return;
    }
    
    const filteredChats = allChats.filter(chat => chat.theme === currentTheme);
    console.log(`📊 Отфильтровано активных чатов для "${currentTheme}":`, filteredChats.length);

    container.innerHTML = '';

    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <div style="font-size: 48px; margin-bottom: 16px;">💬</div>
                <div>Активных чатов в разделе "${currentTheme}" пока нет</div>
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

    if (!myGender || !partnerGender) {
        showNotification('❌ Пожалуйста, выберите пол');
        return;
