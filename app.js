// Добавляем новые глобальные переменные
let waitingTimer = null;
let waitingStartTime = null;
let onlineUsersCount = 0;

// Обновляем функцию initApp
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
        console.log('Приложение запущено в браузере');
        isVK = false;
        vkUser = { 
            id: 'user_' + Date.now(), 
            first_name: 'Анонимный', 
            last_name: 'Пользователь' 
        };
        updateUserInterface(vkUser);
        showNotification('Добро пожаловать в анонимный чат!');
    }

    initSocket();
    await loadAndRenderChats();
    loadUserStats();
    updateProfileStats();
    setupEventListeners();
    updateOnlineUsersCount();
}

// Обновляем функцию createChat
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
            console.log('Чат создан:', result);
            
            const newChat = {
                id: result.id,
                gender: myGender + ', ' + myAge,
                lookingFor: partnerGender + ', ' + minAge + '-' + maxAge,
                theme: currentTheme,
                timestamp: Date.now()
            };
            allChats.unshift(newChat);
            renderChatsList();
            userStats.createdChats++;
            saveUserStats();
            updateProfileStats();
            closeCreateChatModal();
            
            // Показываем экран ожидания вместо прямого входа в чат
            showWaitingScreen(newChat);
        } else {
            throw new Error('Ошибка сервера: ' + response.status);
        }
    } catch (error) {
        console.error('Ошибка создания чата:', error);
        showNotification('❌ Ошибка создания чата: ' + error.message);
    }
}

// Новая функция для показа экрана ожидания
function showWaitingScreen(chat) {
    currentChat = chat;
    showScreen('waitingScreen');
    
    // Запускаем таймер ожидания
    waitingStartTime = Date.now();
    startWaitingTimer();
    
    // Симулируем поиск собеседника (в реальном приложении это было бы через WebSocket)
    simulatePartnerSearch();
    
    // Обновляем счетчик онлайн пользователей
    updateOnlineUsersCount();
}

// Таймер ожидания
function startWaitingTimer() {
    waitingTimer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - waitingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        document.getElementById('waitingTime').textContent = 
            `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Меняем текст в зависимости от времени ожидания
        if (elapsed < 30) {
            document.getElementById('waitingText').textContent = 
                'Ищем собеседника по вашим критериям...';
        } else if (elapsed < 60) {
            document.getElementById('waitingText').textContent = 
                'Все еще ищем подходящего собеседника...';
        } else {
            document.getElementById('waitingText').textContent = 
                'Поиск занимает больше времени, чем обычно...';
        }
    }, 1000);
}

// Симуляция поиска собеседника
function simulatePartnerSearch() {
    // В реальном приложении здесь был бы WebSocket с реальным поиском
    // Сейчас симулируем нахождение собеседника через 3-10 секунд
    const randomDelay = 3000 + Math.random() * 7000;
    
    setTimeout(() => {
        if (currentChat) {
            clearInterval(waitingTimer);
            showNotification('🎉 Собеседник найден!');
            startChat(currentChat);
        }
    }, randomDelay);
}

// Отмена ожидания
function cancelWaiting() {
    if (waitingTimer) {
        clearInterval(waitingTimer);
        waitingTimer = null;
    }
    
    if (currentChat) {
        // В реальном приложении здесь была бы отмена поиска на сервере
        console.log('Поиск отменен для чата:', currentChat.id);
        currentChat = null;
    }
    
    showScreen('chatsScreen');
    showNotification('Поиск собеседника отменен');
}

// Обновляем счетчик онлайн пользователей
function updateOnlineUsersCount() {
    // В реальном приложении это число приходило бы с сервера
    onlineUsersCount = 50 + Math.floor(Math.random() * 150);
    document.getElementById('onlineUsersCount').textContent = onlineUsersCount;
}

// Обновляем функцию startChat
async function startChat(chat) {
    currentChat = chat;
    document.getElementById('chatRoomTitle').textContent = 'Чат: ' + chat.theme;
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

// Обновляем renderChatsList (убираем счетчик участников)
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
                <div style="font-size: 12px; color: var(--text-secondary);">${getTimeAgo(chat.timestamp)}</div>
            </div>
        `;
        container.appendChild(chatElement);
    });
}

// Обновляем обработку входа в VK
function updateUserInterface(userInfo) {
    document.getElementById('vkUserName').textContent = userInfo.first_name + ' ' + userInfo.last_name;
    document.getElementById('vkUserInfo').style.display = 'flex';
    document.getElementById('profileName').textContent = userInfo.first_name + ' ' + userInfo.last_name;
    document.getElementById('currentAvatar').textContent = userInfo.first_name.charAt(0);
    
    // Убираем тестовые уведомления
    if (isVK) {
        showNotification('Добро пожаловать, ' + userInfo.first_name + '!');
    } else {
        showNotification('Добро пожаловать в анонимный чат!');
    }
}

// Остальной код остается без изменений...
