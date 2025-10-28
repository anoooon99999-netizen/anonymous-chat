// ===== ПЕРЕМЕННЫЕ ДЛЯ ЧАТОВ =====
let activeChats = [];
let chatIdCounter = 1;
let currentSocket = null;

// ===== БАЗОВЫЕ ФУНКЦИИ ИНТЕРФЕЙСА =====

// Переключение между экранами
function showScreen(screenId) {
    console.log('Переключение на экран:', screenId);
    const screens = document.querySelectorAll('.screen');
    screens.forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
    
    // Обновляем активное меню
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.classList.remove('active');
    });
    
    if (screenId === 'chatsScreen') {
        document.querySelector('.menu-item:nth-child(1)')?.classList.add('active');
    } else if (screenId === 'profileScreen') {
        document.querySelector('.menu-item:nth-child(2)')?.classList.add('active');
    } else if (screenId === 'settingsScreen') {
        document.querySelector('.menu-item:nth-child(3)')?.classList.add('active');
    }
}

// Переключение вкладок чатов
function switchChatTab(tabName) {
    console.log('Переключение на вкладку:', tabName);
    
    const tabs = document.querySelectorAll('.chat-tab');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = Array.from(tabs).find(tab => 
        tab.textContent.includes(tabName)
    );
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    const createChatText = document.getElementById('createChatText');
    if (createChatText) {
        createChatText.textContent = `Создать чат для ${tabName}`;
    }
}

// Функции для модального окна
function openCreateChatModal() {
    console.log('Открытие модального окна создания чата');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeCreateChatModal() {
    console.log('Закрытие модального окна');
    const modal = document.getElementById('createChatModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function toggleOption(button) {
    const parent = button.parentElement;
    const buttons = parent.querySelectorAll('.option-button');
    buttons.forEach(btn => btn.classList.remove('active'));
    button.classList.add('active');
}

function updateAgeRange() {
    const minSlider = document.getElementById('minAgeSlider');
    const maxSlider = document.getElementById('maxAgeSlider');
    const minAgeValue = document.getElementById('minAgeValue');
    const maxAgeValue = document.getElementById('maxAgeValue');
    
    if (minSlider && maxSlider && minAgeValue && maxAgeValue) {
        minAgeValue.textContent = minSlider.value;
        maxAgeValue.textContent = maxSlider.value;
    }
}

// Базовые функции интерфейса
function enableNotifications() {
    console.log('Включение уведомлений');
    alert('Уведомления включены!');
}

function createChat() {
    console.log('Создание чата с параметрами поиска');
    
    const myGender = document.querySelector('#myGenderOptions .option-button.active')?.textContent || 'Мужской';
    const partnerGender = document.querySelector('#partnerGenderOptions .option-button.active')?.textContent || 'Любой';
    const myAge = document.getElementById('myAge')?.value || '25';
    const minAge = document.getElementById('minAgeSlider')?.value || '18';
    const maxAge = document.getElementById('maxAgeSlider')?.value || '35';
    
    const activeTab = document.querySelector('.chat-tab.active');
    const chatType = activeTab ? activeTab.textContent.replace(/[^\w\s]/g, '').trim() : 'Общение';
    
    console.log('Параметры поиска:', { chatType, myGender, partnerGender, myAge, minAge, maxAge });
    
    closeCreateChatModal();
    startWaiting(chatType);
}

function cancelWaiting() {
    console.log('Отмена поиска собеседника');
    
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    showScreen('chatsScreen');
}

// ===== ФУНКЦИИ ДЛЯ РЕАЛЬНОГО ЧАТА =====

function addChatToHistory(chatType, partnerInfo) {
    const chatId = 'chat_' + chatIdCounter++;
    const newChat = {
        id: chatId,
        type: chatType,
        partner: partnerInfo || {
            name: 'Анонимный пользователь',
            avatar: '👤'
        },
        lastMessage: 'Чат начат',
        timestamp: new Date(),
        unread: 0,
        online: true,
        messages: []
    };
    
    activeChats.unshift(newChat);
    updateChatsList();
    return chatId;
}

function updateChatsList() {
    const chatsContainer = document.getElementById('chatsContainer');
    if (!chatsContainer) return;
    
    if (activeChats.length === 0) {
        chatsContainer.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">Нет активных чатов</div>
                <div class="empty-text">Создайте первый чат чтобы начать общение</div>
            </div>
        `;
        return;
    }
    
    chatsContainer.innerHTML = activeChats.map(chat => `
        <div class="chat-card" onclick="openChat('${chat.id}')">
            <div class="chat-avatar">${chat.partner.avatar}</div>
            <div class="chat-info">
                <div class="chat-header">
                    <div class="chat-name">${chat.partner.name}</div>
                    <div class="chat-time">${formatTime(chat.timestamp)}</div>
                </div>
                <div class="chat-preview">
                    <span class="chat-last-message">${chat.lastMessage}</span>
                    ${chat.unread > 0 ? `<span class="unread-badge">${chat.unread}</span>` : ''}
                </div>
                <div class="chat-meta">
                    <span class="chat-type">${getChatTypeIcon(chat.type)} ${chat.type}</span>
                    <span class="online-status ${chat.online ? 'online' : 'offline'}">
                        ${chat.online ? '🟢 онлайн' : '⚫ офлайн'}
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

function formatTime(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    
    if (minutes < 1) return 'только что';
    if (minutes < 60) return `${minutes} мин назад`;
    if (hours < 24) return `${hours} ч назад`;
    
    return new Date(date).toLocaleDateString('ru-RU');
}

function getChatTypeIcon(type) {
    const icons = {
        'Общение': '💬',
        'Флирт': '😊',
        'Роль': '🎭'
    };
    return icons[type] || '💬';
}

function openChat(chatId) {
    const chat = activeChats.find(c => c.id === chatId);
    if (chat) {
        console.log('Открытие чата:', chatId);
        showScreen('chatRoomScreen');
        
        const chatTitle = document.getElementById('chatRoomTitle');
        if (chatTitle) {
            chatTitle.textContent = `Чат с ${chat.partner.name}`;
        }
        
        loadChatHistory(chatId);
        markAsRead(chatId);
        
        // Инициализация WebSocket для реального чата
        initChatConnection(chatId);
    }
}

function loadChatHistory(chatId) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    messagesContainer.innerHTML = '';
    
    const chat = activeChats.find(c => c.id === chatId);
    if (chat && chat.messages.length > 0) {
        chat.messages.forEach(msg => {
            addMessageToDisplay(msg.text, msg.type, msg.timestamp);
        });
    } else {
        // Пустой чат - нет тестовых сообщений
        addMessageToDisplay('Чат начат. Напишите первое сообщение!', 'system', new Date());
    }
}

function addMessageToDisplay(text, type = 'received', timestamp = new Date()) {
    const messagesContainer = document.getElementById('messagesContainer');
    if (!messagesContainer) return;
    
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    messageElement.innerHTML = `
        <div class="message-avatar">${type === 'received' ? '👤' : '😊'}</div>
        <div class="message-content">
            <div class="message-text">${text}</div>
            <div class="message-time">${formatTime(timestamp)}</div>
        </div>
    `;
    
    messagesContainer.appendChild(messageElement);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function markAsRead(chatId) {
    const chat = activeChats.find(c => c.id === chatId);
    if (chat) {
        chat.unread = 0;
        updateChatsList();
    }
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    if (input && input.value.trim()) {
        const messageText = input.value.trim();
        console.log('Отправка сообщения:', messageText);
        
        // Добавляем сообщение в интерфейс
        addMessageToDisplay(messageText, 'sent', new Date());
        
        // Здесь будет отправка через WebSocket
        if (currentSocket) {
            currentSocket.emit('send_message', {
                text: messageText,
                chatId: window.currentChatId
            });
        }
        
        // Обновляем последнее сообщение в списке чатов
        if (window.currentChatId) {
            const chat = activeChats.find(c => c.id === window.currentChatId);
            if (chat) {
                chat.lastMessage = messageText;
                chat.timestamp = new Date();
                chat.messages.push({
                    text: messageText,
                    type: 'sent',
                    timestamp: new Date()
                });
                updateChatsList();
            }
        }
        
        input.value = '';
    }
}

function handleTyping() {
    // Индикатор набора текста можно добавить позже
}

// ===== ФУНКЦИИ ДЛЯ ЭКРАНА ОЖИДАНИЯ =====

function startWaiting(chatType = 'Общение') {
    console.log('Начало поиска собеседника для:', chatType);
    showScreen('waitingScreen');
    startWaitingTimer();
    updateOnlineUsers();
    
    window.currentChatType = chatType;
    simulateSearch();
}

function startWaitingTimer() {
    waitingSeconds = 0;
    updateWaitingTime();
    
    if (waitingTimer) {
        clearInterval(waitingTimer);
    }
    
    waitingTimer = setInterval(() => {
        waitingSeconds++;
        updateWaitingTime();
        
        if (waitingSeconds % 10 === 0) {
            updateOnlineUsers();
        }
        
        // Реальный поиск - можно настроить время
        if (waitingSeconds === 20) {
            autoFindPartner();
        }
    }, 1000);
}

function updateWaitingTime() {
    const minutes = Math.floor(waitingSeconds / 60);
    const seconds = waitingSeconds % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    const waitingTimeElement = document.getElementById('waitingTime');
    if (waitingTimeElement) {
        waitingTimeElement.textContent = timeString;
    }
}

function updateOnlineUsers() {
    const onlineCount = Math.floor(Math.random() * 1000) + 1500;
    const onlineUsersElement = document.getElementById('onlineUsersCount');
    if (onlineUsersElement) {
        onlineUsersElement.textContent = onlineCount.toLocaleString();
    }
}

function simulateSearch() {
    const waitingText = document.getElementById('waitingText');
    const steps = [
        "Ищем собеседника по вашим критериям...",
        "Проверяем доступных пользователей...", 
        "Подбираем оптимальную пару...",
        "Анализируем интересы...",
        "Почти нашли подходящего собеседника..."
    ];
    
    let currentStep = 0;
    
    const searchInterval = setInterval(() => {
        if (waitingText) {
            waitingText.textContent = steps[currentStep];
            currentStep = (currentStep + 1) % steps.length;
        }
    }, 3000);
    
    setTimeout(() => {
        clearInterval(searchInterval);
    }, 19000);
}

function autoFindPartner() {
    console.log('Собеседник найден!');
    
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    const partnerInfo = generatePartnerInfo();
    const chatId = addChatToHistory(window.currentChatType, partnerInfo);
    window.currentChatId = chatId;
    
    showPartnerFoundNotification();
}

function generatePartnerInfo() {
    const genders = ['Мужской', 'Женский'];
    const names = {
        'Мужской': ['Алексей', 'Дмитрий', 'Максим', 'Иван', 'Сергей'],
        'Женский': ['Анна', 'Мария', 'Елена', 'Ольга', 'Наталья']
    };
    
    const gender = genders[Math.floor(Math.random() * genders.length)];
    const name = names[gender][Math.floor(Math.random() * names[gender].length)];
    
    return {
        name: name,
        gender: gender,
        avatar: gender === 'Мужской' ? '👨' : '👩'
    };
}

function showPartnerFoundNotification() {
    const waitingContent = document.querySelector('.waiting-content');
    if (!waitingContent) return;
    
    const notification = document.createElement('div');
    notification.className = 'partner-found-notification';
    notification.innerHTML = `
        <div class="found-animation">🎉</div>
        <div class="found-title">Собеседник найден!</div>
        <div class="found-subtitle">Переходим в чат...</div>
        <button class="start-chat-button" onclick="enterChatRoom()">Начать общение</button>
    `;
    
    waitingContent.innerHTML = '';
    waitingContent.appendChild(notification);
    updateChatsList();
    
    setTimeout(enterChatRoom, 3000);
}

function enterChatRoom() {
    console.log('Вход в чат комнату');
    
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    showScreen('chatRoomScreen');
    
    if (window.currentChatId) {
        loadChatHistory(window.currentChatId);
        
        const chat = activeChats.find(c => c.id === window.currentChatId);
        if (chat) {
            const chatTitle = document.getElementById('chatRoomTitle');
            if (chatTitle) {
                chatTitle.textContent = `Чат с ${chat.partner.name}`;
            }
        }
    }
}

// ===== WEB SOCKET ИНИЦИАЛИЗАЦИЯ =====
function initChatConnection(chatId) {
    // Здесь будет реальное подключение к WebSocket серверу
    console.log('Инициализация соединения для чата:', chatId);
    
    // Заглушка для реального подключения
    currentSocket = {
        emit: (event, data) => {
            console.log('WebSocket emit:', event, data);
            // В реальном приложении здесь будет отправка на сервер
        }
    };
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', function() {
    console.log('Приложение инициализировано');
    showScreen('chatsScreen');
    switchChatTab('Общение');
    updateAgeRange();
    updateChatsList(); // Инициализация пустого списка чатов
});

// Остальные функции (shareApp, openMyChats, etc.) остаются без изменений
