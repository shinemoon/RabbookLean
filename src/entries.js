// 全局状态
let allEntries = [];
let filteredEntries = [];
let viewMode = 'all'; // 'all' 或 'by-book'
let currentFilter = ''; // 当前选中的书籍uniqueid

function normalizeTimestampMs(timestamp) {
    const value = Number(timestamp || 0);
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    // 历史数据里 time 可能是秒，这里统一转成毫秒
    return value < 1000000000000 ? Math.floor(value * 1000) : Math.floor(value);
}

function getBookGroupKey(entry) {
    const uid = String(entry && entry.uniqueid ? entry.uniqueid : '').trim();
    if (uid) {
        return 'uid::' + uid;
    }
    const fallback = String((entry && (entry.cururlKey || entry.bookmarkId || entry.rTitle)) || '').trim() || 'unknown';
    return 'fallback::' + fallback;
}

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    loadEntries();
    initializeEventListeners();
});

// 初始化事件监听
function initializeEventListeners() {
    // 搜索框
    document.getElementById('search-input').addEventListener('input', function () {
        filterAndRender();
    });

    // 过滤下拉框
    document.getElementById('filter-select').addEventListener('change', function (e) {
        currentFilter = e.target.value;
        filterAndRender();
    });

    // 显示模式按钮
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            viewMode = this.dataset.mode;
            render();
        });
    });
}

// 从后台加载entries数据
function loadEntries() {
    chrome.runtime.sendMessage(
        { type: 'readingEntriesGetAll' },
        function (response) {
            if (chrome.runtime.lastError) {
                showEmptyState('加载失败', chrome.runtime.lastError.message || '消息通道异常');
                return;
            }
            if (response && response.ok && response.entries) {
                allEntries = response.entries.map(entry => {
                    const normalized = Object.assign({}, entry);
                    normalized.timeMs = normalizeTimestampMs(entry && entry.time);
                    return normalized;
                });
                // 按时间倒序排列（最新在前）
                allEntries.sort((a, b) => (b.timeMs || 0) - (a.timeMs || 0));
                
                initializeFilterOptions();
                filterAndRender();
            } else {
                showEmptyState('加载失败', response?.error || '无法获取书摘数据');
            }
        }
    );
}

// 初始化过滤下拉框选项
function initializeFilterOptions() {
    const filterSelect = document.getElementById('filter-select');
    const uniqueBooks = new Map();

    allEntries.forEach(entry => {
        const groupKey = getBookGroupKey(entry);
        if (!uniqueBooks.has(groupKey)) {
            uniqueBooks.set(groupKey, {
                uniqueid: entry.uniqueid || '',
                rTitle: entry.rTitle || '未知书籍'
            });
        }
    });

    // 按书名排序
    const sortedBooks = Array.from(uniqueBooks.entries()).sort((a, b) =>
        String(a[1].rTitle || '').localeCompare(String(b[1].rTitle || ''))
    );

    sortedBooks.forEach(([groupKey, book]) => {
        const option = document.createElement('option');
        option.value = groupKey;
        option.textContent = book.uniqueid || book.rTitle || '未设置书名';
        filterSelect.appendChild(option);
    });
}

// 过滤和渲染
function filterAndRender() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    
    filteredEntries = allEntries.filter(entry => {
        // 按选中的书籍过滤
        if (currentFilter && getBookGroupKey(entry) !== currentFilter) {
            return false;
        }

        // 按搜索文本过滤
        if (searchText) {
            const text = (entry.text || '').toLowerCase();
            const note = (entry.note || '').toLowerCase();
            if (!text.includes(searchText) && !note.includes(searchText)) {
                return false;
            }
        }

        return true;
    });

    updateStats();
    render();
}

// 更新统计信息
function updateStats() {
    document.getElementById('total-count').textContent = allEntries.length;
    document.getElementById('display-count').textContent = filteredEntries.length;
}

// 渲染页面
function render() {
    const container = document.getElementById('entries-list');

    if (filteredEntries.length === 0) {
        if (allEntries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📖</div>
                    <div class="empty-state-text">暂无书摘</div>
                    <div class="empty-state-hint">在阅读页选中文本并添加想法即可记录书摘</div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="no-results">
                    <div class="empty-state-icon">🔍</div>
                    <div class="empty-state-text">未找到匹配的书摘</div>
                    <div class="empty-state-hint">尝试调整搜索条件或过滤条件</div>
                </div>
            `;
        }
        return;
    }

    if (viewMode === 'all') {
        renderAllMode(container);
    } else if (viewMode === 'by-book') {
        renderByBookMode(container);
    }
    bindEntryActions();
}

// 全部模式渲染
function renderAllMode(container) {
    let html = '';

    filteredEntries.forEach((entry, index) => {
        html += renderEntryItem(entry, index);
    });

    container.innerHTML = html;
}

// 按书模式渲染
function renderByBookMode(container) {
    const groupedByBook = groupEntriesByBook();
    let html = '';

    groupedByBook.forEach(bookGroup => {
        html += renderBookSection(bookGroup);
    });

    container.innerHTML = html;
    
    // 绑定书籍头部点击事件
    document.querySelectorAll('.book-header').forEach(header => {
        header.addEventListener('click', function () {
            const section = this.closest('.book-section');
            const entries = section.querySelector('.book-entries');
            
            this.classList.toggle('collapsed');
            entries.classList.toggle('expanded');
        });
    });
}

// 按书分组
function groupEntriesByBook() {
    const grouped = new Map();

    filteredEntries.forEach(entry => {
        const key = getBookGroupKey(entry);
        if (!grouped.has(key)) {
            grouped.set(key, {
                uniqueid: entry.uniqueid || '',
                rTitle: entry.rTitle || '未知书籍',
                displayTitle: entry.uniqueid || entry.rTitle || '未设置书名',
                entries: []
            });
        }
        grouped.get(key).entries.push(entry);
    });

    return Array.from(grouped.values()).sort((a, b) => 
        a.rTitle.localeCompare(b.rTitle)
    );
}

// 渲染书籍分区
function renderBookSection(bookGroup) {
    const entryCount = bookGroup.entries.length;
    let entriesHtml = '';

    bookGroup.entries.forEach((entry) => {
        const entryIndex = filteredEntries.indexOf(entry);
        entriesHtml += renderEntryItem(entry, entryIndex);
    });

    return `
        <div class="book-section">
            <div class="book-header">
                <span class="book-toggle">▼</span>
                <div class="book-info">
                    <div class="book-title">${escapeHtml(bookGroup.displayTitle || bookGroup.uniqueid || bookGroup.rTitle || '未设置书名')}</div>
                </div>
                <span class="entry-count">${entryCount} 条</span>
            </div>
            <div class="book-entries expanded">
                ${entriesHtml}
            </div>
        </div>
    `;
}

// 渲染单条entry
function renderEntryItem(entry, index) {
    const timeStr = entry.timeMs ? formatTime(entry.timeMs) : '未记录';
    const chapterStr = entry.chapter ? escapeHtml(entry.chapter) : '未知章节';
    const bookNameStr = entry.uniqueid ? escapeHtml(entry.uniqueid) : (entry.rTitle ? escapeHtml(entry.rTitle) : '未知书籍');
    const noteHtml = entry.note 
        ? `<div class="entry-note">${escapeHtml(entry.note)}</div>`
        : `<div class="entry-note empty">（无想法）</div>`;
    const entryKey = 'entry_' + (entry.bookmarkId || '') + '_' + (entry.uniqueid || '') + '_' + (entry.cururlKey || '') + '_' + index;

    return `
        <div class="entry-item" data-entry-key="${escapeHtml(entryKey)}" data-entry-index="${index}">
            <div class="entry-text">${escapeHtml(entry.text)}</div>
            ${noteHtml}
            <div class="entry-meta">
                <span>
                    <span class="entry-book-name">${bookNameStr}</span>
                    <span class="entry-chapter">${chapterStr}</span>
                    <span class="entry-time">${timeStr}</span>
                </span>
                <span class="entry-actions">
                    <button class="entry-edit-btn" title="编辑" data-entry-index="${index}">编辑</button>
                    <button class="entry-delete-btn" title="删除" data-entry-index="${index}">删除</button>
                </span>
            </div>
        </div>
    `;
}

// 显示空状态
function showEmptyState(title, message) {
    const container = document.getElementById('entries-list');
    container.innerHTML = `
        <div class="empty-state">
            <div class="empty-state-icon">⚠️</div>
            <div class="empty-state-text">${escapeHtml(title)}</div>
            <div class="empty-state-hint">${escapeHtml(message)}</div>
        </div>
    `;
}

// 格式化时间
function formatTime(timestamp) {
    if (!timestamp) return '未记录';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 如果小于1分钟
    if (diff < 60000) {
        return '刚刚';
    }

    // 如果小于1小时
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} 分钟前`;
    }

    // 如果小于1天
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} 小时前`;
    }

    // 如果小于7天
    if (diff < 604800000) {
        const days = Math.floor(diff / 86400000);
        return `${days} 天前`;
    }

    // 否则显示日期
    return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

// HTML转义
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// 统一提示
function showToast(message, type) {
    const level = type || 'success';
    const containerId = 'entries-toast-container';
    let container = document.getElementById(containerId);
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.className = 'entries-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'entries-toast ' + (level === 'danger' ? 'danger' : level === 'warn' ? 'warn' : 'success');
    toast.textContent = String(message || '操作完成');
    container.appendChild(toast);

    setTimeout(function () {
        toast.classList.add('show');
    }, 10);

    setTimeout(function () {
        toast.classList.remove('show');
        setTimeout(function () {
            if (toast && toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            if (container && container.childElementCount === 0 && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        }, 180);
    }, 2200);
}

function showConfirmDialog(options) {
    const opts = options || {};
    const title = String(opts.title || '请确认');
    const message = String(opts.message || '确认继续吗？');
    const confirmText = String(opts.confirmText || '确认');
    const cancelText = String(opts.cancelText || '取消');
    const danger = !!opts.danger;

    return new Promise(function (resolve) {
        const old = document.getElementById('entries-custom-dialog-backdrop');
        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'entries-custom-dialog-backdrop';
        backdrop.className = 'entries-dialog-backdrop';
        backdrop.innerHTML = '' +
            '<div class="entries-dialog" role="dialog" aria-modal="true">' +
            '  <div class="entries-dialog-title"></div>' +
            '  <div class="entries-dialog-message"></div>' +
            '  <div class="entries-dialog-actions">' +
            '    <button type="button" class="entries-dialog-btn entries-dialog-cancel"></button>' +
            '    <button type="button" class="entries-dialog-btn entries-dialog-confirm"></button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(backdrop);

        const titleEl = backdrop.querySelector('.entries-dialog-title');
        const messageEl = backdrop.querySelector('.entries-dialog-message');
        const cancelBtn = backdrop.querySelector('.entries-dialog-cancel');
        const confirmBtn = backdrop.querySelector('.entries-dialog-confirm');

        titleEl.textContent = title;
        messageEl.textContent = message;
        cancelBtn.textContent = cancelText;
        confirmBtn.textContent = confirmText;
        if (danger) {
            confirmBtn.classList.add('danger');
        }

        function close(result) {
            if (backdrop && backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
            resolve(!!result);
        }

        cancelBtn.addEventListener('click', function (e) {
            e.preventDefault();
            close(false);
        });
        confirmBtn.addEventListener('click', function (e) {
            e.preventDefault();
            close(true);
        });
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) {
                close(false);
            }
        });
        backdrop.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close(false);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                close(true);
            }
        });
        setTimeout(function () {
            confirmBtn.focus();
        }, 0);
    });
}

function showInputDialog(options) {
    const opts = options || {};
    const title = String(opts.title || '请输入');
    const message = String(opts.message || '');
    const placeholder = String(opts.placeholder || '');
    const defaultValue = String(opts.defaultValue || '');
    const confirmText = String(opts.confirmText || '保存');
    const cancelText = String(opts.cancelText || '取消');

    return new Promise(function (resolve) {
        const old = document.getElementById('entries-custom-dialog-backdrop');
        if (old && old.parentNode) {
            old.parentNode.removeChild(old);
        }

        const backdrop = document.createElement('div');
        backdrop.id = 'entries-custom-dialog-backdrop';
        backdrop.className = 'entries-dialog-backdrop';
        backdrop.innerHTML = '' +
            '<div class="entries-dialog" role="dialog" aria-modal="true">' +
            '  <div class="entries-dialog-title"></div>' +
            '  <div class="entries-dialog-message"></div>' +
            '  <textarea class="entries-dialog-input" rows="4"></textarea>' +
            '  <div class="entries-dialog-actions">' +
            '    <button type="button" class="entries-dialog-btn entries-dialog-cancel"></button>' +
            '    <button type="button" class="entries-dialog-btn entries-dialog-confirm"></button>' +
            '  </div>' +
            '</div>';
        document.body.appendChild(backdrop);

        const titleEl = backdrop.querySelector('.entries-dialog-title');
        const messageEl = backdrop.querySelector('.entries-dialog-message');
        const inputEl = backdrop.querySelector('.entries-dialog-input');
        const cancelBtn = backdrop.querySelector('.entries-dialog-cancel');
        const confirmBtn = backdrop.querySelector('.entries-dialog-confirm');

        titleEl.textContent = title;
        messageEl.textContent = message;
        inputEl.placeholder = placeholder;
        inputEl.value = defaultValue;
        cancelBtn.textContent = cancelText;
        confirmBtn.textContent = confirmText;

        function close(action) {
            const value = String(inputEl.value || '').trim();
            if (backdrop && backdrop.parentNode) {
                backdrop.parentNode.removeChild(backdrop);
            }
            resolve({ action: action, value: value });
        }

        cancelBtn.addEventListener('click', function (e) {
            e.preventDefault();
            close('cancel');
        });
        confirmBtn.addEventListener('click', function (e) {
            e.preventDefault();
            close('confirm');
        });
        backdrop.addEventListener('click', function (e) {
            if (e.target === backdrop) {
                close('cancel');
            }
        });
        inputEl.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                close('cancel');
                return;
            }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                close('confirm');
            }
        });

        setTimeout(function () {
            inputEl.focus();
        }, 0);
    });
}

// 删除entry
function deleteEntry(entryIndex) {
    const entry = filteredEntries[entryIndex];
    if (!entry) return;
    
    chrome.runtime.sendMessage(
        {
            type: 'readingEntryDelete',
            bookmarkId: entry.bookmarkId,
            uniqueid: entry.uniqueid,
            cururlKey: entry.cururlKey,
            entryText: entry.text,
            entryChapter: entry.chapter,
            entryTime: entry.time
        },
        function (response) {
            if (chrome.runtime.lastError) {
                const message = String(chrome.runtime.lastError.message || '');
                // 某些情况下后台已完成写入但响应口提前关闭，避免误报失败。
                if (message.indexOf('before a response was received') >= 0) {
                    loadEntries();
                    showToast('删除请求已发送，列表已刷新', 'warn');
                    return;
                }
                showToast(message || '删除失败', 'danger');
                return;
            }
            if (response && response.ok) {
                showToast('书摘已删除');
                loadEntries();
            } else {
                showToast((response && response.error) || '删除失败', 'danger');
            }
        }
    );
}

// 编辑entry
async function editEntry(entryIndex) {
    const entry = filteredEntries[entryIndex];
    if (!entry) return;

    const input = await showInputDialog({
        title: '编辑书摘想法',
        message: entry.text || '',
        placeholder: '输入你的想法（可留空）',
        defaultValue: entry.note || '',
        confirmText: '保存',
        cancelText: '取消'
    });
    if (!input || input.action !== 'confirm') {
        return;
    }
    const newNote = input.value;
    
    chrome.runtime.sendMessage(
        {
            type: 'readingEntryUpdate',
            bookmarkId: entry.bookmarkId,
            uniqueid: entry.uniqueid,
            cururlKey: entry.cururlKey,
            entryText: entry.text,
            entryChapter: entry.chapter,
            entryTime: entry.time,
            newNote: String(newNote || '').trim()
        },
        function (response) {
            if (chrome.runtime.lastError) {
                showToast(chrome.runtime.lastError.message || '更新失败', 'danger');
                return;
            }
            if (response && response.ok) {
                showToast('书摘已更新');
                loadEntries();
            } else {
                showToast((response && response.error) || '更新失败', 'danger');
            }
        }
    );
}

// 绑定entry操作事件
function bindEntryActions() {
    const container = document.getElementById('entries-list');
    if (!container || container.__rbEntryActionsBound) {
        return;
    }
    container.__rbEntryActionsBound = true;

    container.addEventListener('click', async function (e) {
        const deleteBtn = e.target.closest('.entry-delete-btn');
        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            const entryIndex = Number(deleteBtn.dataset.entryIndex);
            if (!Number.isFinite(entryIndex) || entryIndex < 0) {
                return;
            }
            const confirmed = await showConfirmDialog({
                title: '确认删除',
                message: '确定删除这条书摘吗？此操作不可撤销。',
                confirmText: '删除',
                cancelText: '取消',
                danger: true
            });
            if (confirmed) {
                deleteEntry(entryIndex);
            }
            return;
        }

        const editBtn = e.target.closest('.entry-edit-btn');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const entryIndex = Number(editBtn.dataset.entryIndex);
            if (!Number.isFinite(entryIndex) || entryIndex < 0) {
                return;
            }
            editEntry(entryIndex);
        }
    });
}
