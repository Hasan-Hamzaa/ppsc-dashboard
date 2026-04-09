(() => {
    'use strict';

    const STORAGE_KEYS = {
        events: 'ppsc_events_v3',
        activity: 'ppsc_activity_v3',
        meta: 'ppsc_meta_v1'
    };
    const DATA_FILE_PATH = 'data.json';

    const BANKS = [
        'Bank of Palestine',
        'Palestine Islamic Bank',
        'Arab Islamic Bank',
        'Palestine Investment Bank',
        'Quds Bank',
        'The National Bank',
        'Safa Bank',
        'Arab Bank',
        'Cairo Amman Bank',
        'Bank of Jordan',
        'Housing Bank for Trade and Finance',
        'Egyptian Arab Land Bank',
        'Jordan Ahli Bank',
        'Jordan Commercial Bank',
        'PalPay',
        'Jawwal Pay'
    ];

    const SYSTEMS = ['ECC', 'ESADAD', 'National Switch', 'IBURAQ'];
    const IMPACT_LEVELS = ['Low', 'Medium', 'High', 'Critical'];
    const SLA_TARGET_UPTIME = 99.5;

    const state = {
        events: [],
        activities: [],
        linkedDataFileHandle: null,
        filters: {
            banks: new Set(BANKS),
            systems: new Set(SYSTEMS)
        },
        searchTerm: '',
        sort: {
            key: 'start',
            dir: 'desc'
        },
        pagination: {
            page: 1,
            pageSize: 8
        },
        calendarCursor: startOfMonth(new Date()),
        editingId: null,
        selectedEventId: null,
        openDropdown: null,
        meta: {
            sidebarCollapsed: false
        },
        storageWarnings: []
    };

    const el = {};

    async function init() {
        cacheElements();
        state.meta = loadMeta();
        const projectData = await loadProjectDataFile();
        state.events = loadEvents(projectData ? projectData.events : null);
        state.activities = loadActivities(projectData ? projectData.activities : null);
        applyMetaToUI();

        populateFormSelects();
        renderFilterMenus();
        bindListeners();
        toggleEventComposer(false);
        renderFormDuration();
        renderAll();

        if (state.storageWarnings.length) {
            state.storageWarnings.forEach((warning) => {
                showToast(warning, 'warning', 7000);
            });
        }
    }

    function isValidEventShape(event) {
        if (!event || typeof event !== 'object') {
            return false;
        }
        const hasRequired = ['id', 'type', 'bank', 'system', 'impact', 'start', 'end'].every((field) => Boolean(event[field]));
        if (!hasRequired) {
            return false;
        }
        const start = new Date(event.start).getTime();
        const end = new Date(event.end).getTime();
        return Number.isFinite(start) && Number.isFinite(end) && end > start;
    }

    function isValidActivityShape(entry) {
        return entry && typeof entry.title === 'string' && Number.isFinite(entry.timestamp);
    }

    async function loadProjectDataFile() {
        try {
            const response = await fetch(DATA_FILE_PATH, { cache: 'no-store' });
            if (!response.ok) {
                return null;
            }

            const payload = await response.json();
            if (!payload || typeof payload !== 'object' || !Array.isArray(payload.events)) {
                state.storageWarnings.push('Project data.json is invalid. Falling back to browser storage data.');
                return null;
            }

            const valid = payload.events.filter(isValidEventShape).map(normalizeEvent);
            if (!valid.length) {
                state.storageWarnings.push('Project data.json has no valid events. Falling back to browser storage data.');
                return null;
            }

            const validActivities = Array.isArray(payload.activities)
                ? payload.activities.filter(isValidActivityShape).slice(0, 100)
                : [];

            safeWrite(STORAGE_KEYS.events, valid);
            safeWrite(STORAGE_KEYS.activity, validActivities);
            return {
                events: valid,
                activities: validActivities
            };
        } catch (error) {
            return null;
        }
    }

    function cacheElements() {
        el.sidebar = document.getElementById('sidebar');
        el.sidebarCollapseBtn = document.getElementById('sidebarCollapseBtn');
        el.mobileMenuBtn = document.getElementById('mobileMenuBtn');
        el.sidebarScrim = document.getElementById('sidebarScrim');
        el.navLinks = Array.from(document.querySelectorAll('.nav-link'));
        el.lastUpdated = document.getElementById('lastUpdatedText');

        el.printBtn = document.getElementById('printBtn');
        el.saveJsonBtn = document.getElementById('saveJsonBtn');
        el.linkDataFileBtn = document.getElementById('linkDataFileBtn');

        el.bankDropdownToggle = document.getElementById('bankDropdownToggle');
        el.systemDropdownToggle = document.getElementById('systemDropdownToggle');
        el.bankDropdownMenu = document.getElementById('bankDropdownMenu');
        el.systemDropdownMenu = document.getElementById('systemDropdownMenu');
        el.bankFilterLabel = document.getElementById('bankFilterLabel');
        el.systemFilterLabel = document.getElementById('systemFilterLabel');
        el.filterSummary = document.getElementById('filterSummary');
        el.resetFiltersBtn = document.getElementById('resetFiltersBtn');

        el.kpiIncidents = document.getElementById('kpiIncidents');
        el.kpiDowntime = document.getElementById('kpiDowntime');
        el.kpiDowntimeCard = document.getElementById('kpiDowntimeCard');
        el.kpiDowntimeHealth = document.getElementById('kpiDowntimeHealth');
        el.kpiPlannedVsEmergency = document.getElementById('kpiPlannedVsEmergency');
        el.kpiUptime = document.getElementById('kpiUptime');
        el.kpiCompliance = document.getElementById('kpiCompliance');
        el.kpiAvgDuration = document.getElementById('kpiAvgDuration');

        el.notificationCount = document.getElementById('notificationCount');

        el.eventForm = document.getElementById('eventForm');
        el.eventComposer = document.getElementById('eventComposer');
        el.formTitle = document.getElementById('eventFormTitle');
        el.formHint = document.getElementById('eventFormHint');
        el.formType = document.getElementById('eventType');
        el.formBank = document.getElementById('eventBank');
        el.formSystem = document.getElementById('eventSystem');
        el.formImpact = document.getElementById('eventImpact');
        el.formStart = document.getElementById('eventStart');
        el.formEnd = document.getElementById('eventEnd');
        el.formDuration = document.getElementById('eventDuration');
        el.formNotes = document.getElementById('eventNotes');
        el.formSubmitBtn = document.getElementById('eventSubmitBtn');
        el.cancelEditBtn = document.getElementById('cancelEditBtn');
        el.validationBox = document.getElementById('validationBox');
        el.validationList = document.getElementById('validationList');
        el.conflictList = document.getElementById('conflictList');

        el.calendarMonthLabel = document.getElementById('calendarMonthLabel');
        el.calendarGrid = document.getElementById('calendarGrid');
        el.prevMonthBtn = document.getElementById('prevMonthBtn');
        el.nextMonthBtn = document.getElementById('nextMonthBtn');

        el.tableSearch = document.getElementById('tableSearch');
        el.tableBody = document.getElementById('tableBody');
        el.tableResultCount = document.getElementById('tableResultCount');
        el.tablePageInfo = document.getElementById('tablePageInfo');
        el.prevPageBtn = document.getElementById('prevPageBtn');
        el.nextPageBtn = document.getElementById('nextPageBtn');
        el.sortButtons = Array.from(document.querySelectorAll('[data-sort]'));
        el.clearEventsBtn = document.getElementById('clearEventsBtn');

        el.eventModal = document.getElementById('eventModal');
        el.modalCloseBtn = document.getElementById('modalCloseBtn');
        el.modalTitle = document.getElementById('modalTitle');
        el.modalContent = document.getElementById('modalContent');
        el.modalEditBtn = document.getElementById('modalEditBtn');
        el.modalDeleteBtn = document.getElementById('modalDeleteBtn');

        el.toastStack = document.getElementById('toastStack');
    }

    function bindListeners() {
        el.sidebarCollapseBtn.addEventListener('click', toggleSidebarCollapse);
        el.mobileMenuBtn.addEventListener('click', toggleMobileSidebar);
        el.sidebarScrim.addEventListener('click', closeMobileSidebar);

        el.navLinks.forEach((link) => {
            link.addEventListener('click', (event) => {
                const targetId = event.currentTarget.getAttribute('data-target');
                const target = document.getElementById(targetId);

                toggleEventComposer(targetId === 'eventComposer');
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                setActiveNav(targetId);
                closeMobileSidebar();
            });
        });

        if (el.linkDataFileBtn) {
            el.linkDataFileBtn.addEventListener('click', linkProjectDataFile);
        }
        if (el.saveJsonBtn) {
            el.saveJsonBtn.addEventListener('click', exportDataSnapshot);
        }
        el.printBtn.addEventListener('click', () => {
            logActivity('report', 'Print view opened.');
            window.print();
        });

        el.bankDropdownToggle.addEventListener('click', () => toggleDropdown('bank'));
        el.systemDropdownToggle.addEventListener('click', () => toggleDropdown('system'));
        el.resetFiltersBtn.addEventListener('click', resetFilters);

        el.tableSearch.addEventListener('input', (event) => {
            state.searchTerm = event.target.value.trim().toLowerCase();
            state.pagination.page = 1;
            renderAll();
        });

        el.sortButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const key = button.getAttribute('data-sort');
                applySorting(key);
            });
        });

        el.prevPageBtn.addEventListener('click', () => {
            if (state.pagination.page > 1) {
                state.pagination.page -= 1;
                renderTable(getVisibleEvents());
            }
        });

        el.nextPageBtn.addEventListener('click', () => {
            const visible = getVisibleEvents();
            const totalPages = Math.max(1, Math.ceil(visible.length / state.pagination.pageSize));
            if (state.pagination.page < totalPages) {
                state.pagination.page += 1;
                renderTable(visible);
            }
        });

        el.eventForm.addEventListener('submit', handleSubmitEvent);
        el.cancelEditBtn.addEventListener('click', resetFormMode);
        if (el.clearEventsBtn) {
            el.clearEventsBtn.addEventListener('click', clearAllEvents);
        }
        el.formStart.addEventListener('input', renderFormDuration);
        el.formEnd.addEventListener('input', renderFormDuration);

        el.prevMonthBtn.addEventListener('click', () => {
            state.calendarCursor.setMonth(state.calendarCursor.getMonth() - 1);
            renderAll();
        });

        el.nextMonthBtn.addEventListener('click', () => {
            state.calendarCursor.setMonth(state.calendarCursor.getMonth() + 1);
            renderAll();
        });

        el.tableBody.addEventListener('click', handleTableActions);
        el.calendarGrid.addEventListener('click', handleCalendarClick);

        el.modalCloseBtn.addEventListener('click', closeEventModal);
        el.eventModal.addEventListener('click', (event) => {
            if (event.target === el.eventModal) {
                closeEventModal();
            }
        });
        el.modalEditBtn.addEventListener('click', () => {
            if (state.selectedEventId) {
                beginEdit(state.selectedEventId);
                closeEventModal();
            }
        });
        el.modalDeleteBtn.addEventListener('click', () => {
            if (state.selectedEventId) {
                deleteEvent(state.selectedEventId);
                closeEventModal();
            }
        });

        document.addEventListener('click', (event) => {
            const inDropdown = event.target.closest('.field-group');
            if (!inDropdown) {
                closeDropdowns();
            }
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth > 960) {
                closeMobileSidebar();
            }
        });
    }

    function renderAll() {
        const visible = getVisibleEvents();
        renderFilterSummary();
        renderKpis(visible);
        renderCalendar(visible);
        renderTable(visible);
        renderNotifications();
        updateLastUpdated();
    }

    function toggleEventComposer(show) {
        if (!el.eventComposer) {
            return;
        }
        el.eventComposer.classList.toggle('is-hidden', !show);
    }

    function renderFilterMenus() {
        el.bankDropdownMenu.innerHTML = BANKS.map((bank) => {
            const checked = state.filters.banks.has(bank) ? 'checked' : '';
            return `<label class="dropdown-option"><input type="checkbox" class="filter-bank" value="${escapeHtml(bank)}" ${checked}>${escapeHtml(bank)}</label>`;
        }).join('');

        el.systemDropdownMenu.innerHTML = SYSTEMS.map((system) => {
            const checked = state.filters.systems.has(system) ? 'checked' : '';
            return `<label class="dropdown-option"><input type="checkbox" class="filter-system" value="${escapeHtml(system)}" ${checked}>${escapeHtml(system)}</label>`;
        }).join('');

        Array.from(el.bankDropdownMenu.querySelectorAll('.filter-bank')).forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                updateSetFromCheckboxes('bank');
                state.pagination.page = 1;
                renderAll();
            });
        });

        Array.from(el.systemDropdownMenu.querySelectorAll('.filter-system')).forEach((checkbox) => {
            checkbox.addEventListener('change', () => {
                updateSetFromCheckboxes('system');
                state.pagination.page = 1;
                renderAll();
            });
        });
    }

    function updateSetFromCheckboxes(type) {
        if (type === 'bank') {
            const selected = Array.from(el.bankDropdownMenu.querySelectorAll('.filter-bank:checked')).map((x) => x.value);
            state.filters.banks = new Set(selected);
        } else {
            const selected = Array.from(el.systemDropdownMenu.querySelectorAll('.filter-system:checked')).map((x) => x.value);
            state.filters.systems = new Set(selected);
        }
    }

    function renderFilterSummary() {
        const selectedBanks = state.filters.banks.size;
        const selectedSystems = state.filters.systems.size;

        el.bankFilterLabel.textContent = labelForSelection(selectedBanks, BANKS.length, 'Bank');
        el.systemFilterLabel.textContent = labelForSelection(selectedSystems, SYSTEMS.length, 'System');

        const bankTag = `<span class="tag tag-info"><i class="fa-solid fa-building-columns"></i>${selectedBanks}/${BANKS.length} Banks</span>`;
        const systemTag = `<span class="tag tag-info"><i class="fa-solid fa-server"></i>${selectedSystems}/${SYSTEMS.length} Systems</span>`;
        const searchTag = state.searchTerm
            ? `<span class="tag tag-info"><i class="fa-solid fa-magnifying-glass"></i>Search: ${escapeHtml(state.searchTerm)}</span>`
            : '<span class="tag tag-info"><i class="fa-solid fa-filter-circle-xmark"></i>No Search Query</span>';

        el.filterSummary.innerHTML = `${bankTag}${systemTag}${searchTag}`;
    }

    function labelForSelection(count, total, singular) {
        if (count === 0) {
            return `No ${singular}s selected`;
        }
        if (count === total) {
            return `All ${singular}s selected`;
        }
        return `${count} ${singular}${count > 1 ? 's' : ''} selected`;
    }

    function resetFilters() {
        state.filters.banks = new Set(BANKS);
        state.filters.systems = new Set(SYSTEMS);
        state.searchTerm = '';
        state.pagination.page = 1;
        el.tableSearch.value = '';
        renderFilterMenus();
        renderAll();
        showToast('Filters and search were reset.', 'success');
    }

    function getVisibleEvents() {
        const sorted = state.events
            .filter((event) => state.filters.banks.has(event.bank) && state.filters.systems.has(event.system))
            .filter((event) => {
                if (!state.searchTerm) {
                    return true;
                }
                const haystack = `${event.id} ${event.type} ${event.bank} ${event.system} ${event.impact} ${event.notes || ''}`.toLowerCase();
                return haystack.includes(state.searchTerm);
            })
            .sort((a, b) => compareEvents(a, b, state.sort));

        return sorted;
    }

    function compareEvents(a, b, sort) {
        const left = sortValue(a, sort.key);
        const right = sortValue(b, sort.key);

        if (left < right) {
            return sort.dir === 'asc' ? -1 : 1;
        }
        if (left > right) {
            return sort.dir === 'asc' ? 1 : -1;
        }
        return 0;
    }

    function sortValue(event, key) {
        if (key === 'id') {
            const numericId = Number(String(event.id || '').replace(/[^0-9]/g, ''));
            return Number.isFinite(numericId) ? numericId : 0;
        }
        if (key === 'start' || key === 'end') {
            return new Date(event[key]).getTime();
        }
        if (key === 'duration') {
            return Number(event.durationHours || 0);
        }
        return String(event[key] || '').toLowerCase();
    }

    function applySorting(key) {
        if (state.sort.key === key) {
            state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            state.sort.key = key;
            state.sort.dir = key === 'start' || key === 'end' || key === 'duration' ? 'desc' : 'asc';
        }
        state.pagination.page = 1;
        renderTable(getVisibleEvents());
        updateSortLabels();
    }

    function updateSortLabels() {
        el.sortButtons.forEach((button) => {
            const key = button.getAttribute('data-sort');
            const indicator = button.querySelector('.sort-indicator');
            if (!indicator) {
                return;
            }
            if (key !== state.sort.key) {
                indicator.textContent = '↕';
                return;
            }
            indicator.textContent = state.sort.dir === 'asc' ? '↑' : '↓';
        });
    }

    function renderKpis(visibleEvents) {
        const totalIncidents = visibleEvents.length;
        const totalDowntime = sumDowntime(visibleEvents);
        const plannedCount = visibleEvents.filter((event) => event.type === 'Planned').length;
        const emergencyCount = visibleEvents.filter((event) => event.type === 'Emergency').length;
        const avgDuration = totalIncidents ? totalDowntime / totalIncidents : 0;

        const sla = calculateSla(totalDowntime, state.calendarCursor);
        const health = downtimeHealth(totalDowntime);

        el.kpiIncidents.textContent = String(totalIncidents);
        el.kpiDowntime.textContent = `${totalDowntime.toFixed(1)} hrs`;
        el.kpiPlannedVsEmergency.textContent = `${plannedCount} Planned / ${emergencyCount} Emergency`;
        el.kpiUptime.textContent = `${sla.uptime.toFixed(2)}%`;
        el.kpiCompliance.textContent = sla.compliant ? 'SLA Compliant' : 'SLA At Risk';
        el.kpiAvgDuration.textContent = `${avgDuration.toFixed(2)} hrs average incident duration`;

        el.kpiDowntimeCard.classList.remove('health-healthy', 'health-warning', 'health-critical');
        el.kpiDowntimeCard.classList.add(`health-${health}`);

        const healthMeta = {
            healthy: '<i class="fa-solid fa-circle-check"></i> Healthy',
            warning: '<i class="fa-solid fa-triangle-exclamation"></i> Warning',
            critical: '<i class="fa-solid fa-bolt"></i> Critical'
        };
        const healthClass = {
            healthy: 'tag tag-good',
            warning: 'tag tag-warn',
            critical: 'tag tag-critical'
        };

        el.kpiDowntimeHealth.className = healthClass[health];
        el.kpiDowntimeHealth.innerHTML = healthMeta[health];
    }

    function renderNotifications() {
        const threshold = Date.now() - 24 * 60 * 60 * 1000;
        const freshNewEvents = state.activities.filter((item) => item.type === 'create' && item.timestamp >= threshold).length;
        el.notificationCount.textContent = String(freshNewEvents);
    }

    function renderCalendar(visibleEvents) {
        const monthLabel = state.calendarCursor.toLocaleString('en-US', { month: 'long', year: 'numeric' });
        el.calendarMonthLabel.textContent = monthLabel;

        const year = state.calendarCursor.getFullYear();
        const month = state.calendarCursor.getMonth();
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const cells = [];

        for (let i = 0; i < firstWeekday; i += 1) {
            cells.push(`<div class="calendar-day muted-day"></div>`);
        }

        for (let day = 1; day <= daysInMonth; day += 1) {
            const dayDate = new Date(year, month, day);
            const today = isSameDate(dayDate, new Date());
            const dayEvents = visibleEvents
                .filter((event) => eventOverlapsDay(event, dayDate))
                .sort((a, b) => new Date(a.start) - new Date(b.start));

            const badges = dayEvents.slice(0, 2).map((event) => {
                const typeClass = event.type === 'Emergency' ? 'emergency' : 'planned';
                return `<button class="event-pill ${typeClass}" data-event-id="${escapeHtml(event.id)}">
                    <i class="fa-solid ${event.type === 'Emergency' ? 'fa-bolt' : 'fa-screwdriver-wrench'}"></i>
                    ${escapeHtml(event.system)}
                    <span class="tooltip">
                        <strong>${escapeHtml(event.id)}</strong><br>
                        ${escapeHtml(event.bank)} · ${escapeHtml(event.system)}<br>
                        ${escapeHtml(event.type)} · ${event.durationHours.toFixed(2)} hrs<br>
                        ${formatDateTime(event.start)} to ${formatDateTime(event.end)}
                    </span>
                </button>`;
            });

            if (dayEvents.length > 2) {
                badges.push(`<button class="event-pill planned" data-day-details="${day}">+${dayEvents.length - 2} more</button>`);
            }

            cells.push(`<div class="calendar-day">
                <span class="day-number ${today ? 'today' : ''}">${day}</span>
                <div class="day-events">${badges.join('')}</div>
            </div>`);
        }

        const totalCells = firstWeekday + daysInMonth;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
            for (let i = 0; i < 7 - remainder; i += 1) {
                cells.push(`<div class="calendar-day muted-day"></div>`);
            }
        }

        el.calendarGrid.innerHTML = cells.join('');
    }

    function renderTable(visibleEvents) {
        updateSortLabels();

        const total = visibleEvents.length;
        const totalPages = Math.max(1, Math.ceil(total / state.pagination.pageSize));
        if (state.pagination.page > totalPages) {
            state.pagination.page = totalPages;
        }

        const startIndex = (state.pagination.page - 1) * state.pagination.pageSize;
        const paged = visibleEvents.slice(startIndex, startIndex + state.pagination.pageSize);

        if (!paged.length) {
            el.tableBody.innerHTML = `<tr><td colspan="9"><div class="empty-state">No events found for the current filters. Try reset filters or add a maintenance event.</div></td></tr>`;
        } else {
            el.tableBody.innerHTML = paged
                .map((event) => {
                    const rowClass = event.type === 'Emergency' ? 'row-emergency' : 'row-planned';
                    return `<tr class="maintenance-row ${rowClass}">
                        <td><strong>${escapeHtml(event.id)}</strong></td>
                        <td>${renderTypeChip(event.type)}</td>
                        <td>${escapeHtml(event.bank)}</td>
                        <td>${escapeHtml(event.system)}</td>
                        <td>${escapeHtml(formatDateTime(event.start))}</td>
                        <td>${escapeHtml(formatDateTime(event.end))}</td>
                        <td>${event.durationHours.toFixed(2)}</td>
                        <td><span class="impact-chip">${escapeHtml(event.impact)}</span></td>
                        <td>
                            <div class="actions">
                                <button data-action="view" data-id="${escapeHtml(event.id)}" title="View details"><i class="fa-regular fa-eye"></i></button>
                                <button data-action="edit" data-id="${escapeHtml(event.id)}" title="Edit event"><i class="fa-regular fa-pen-to-square"></i></button>
                                <button data-action="delete" data-id="${escapeHtml(event.id)}" class="delete" title="Delete event"><i class="fa-regular fa-trash-can"></i></button>
                            </div>
                        </td>
                    </tr>`;
                })
                .join('');
        }

        const first = total === 0 ? 0 : startIndex + 1;
        const last = Math.min(startIndex + state.pagination.pageSize, total);
        el.tableResultCount.textContent = `Showing ${first} - ${last} of ${total} events`;
        el.tablePageInfo.textContent = `Page ${state.pagination.page} / ${totalPages}`;

        el.prevPageBtn.disabled = state.pagination.page <= 1;
        el.nextPageBtn.disabled = state.pagination.page >= totalPages;
    }

    function handleTableActions(event) {
        const actionButton = event.target.closest('button[data-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.getAttribute('data-action');
        const eventId = actionButton.getAttribute('data-id');
        if (!eventId) {
            return;
        }

        if (action === 'view') {
            openEventModal(eventId);
        }
        if (action === 'edit') {
            beginEdit(eventId);
        }
        if (action === 'delete') {
            deleteEvent(eventId);
        }
    }

    function handleCalendarClick(event) {
        const eventButton = event.target.closest('[data-event-id]');
        if (eventButton) {
            openEventModal(eventButton.getAttribute('data-event-id'));
            return;
        }

        const detailsButton = event.target.closest('[data-day-details]');
        if (!detailsButton) {
            return;
        }

        const day = Number(detailsButton.getAttribute('data-day-details'));
        const dayDate = new Date(state.calendarCursor.getFullYear(), state.calendarCursor.getMonth(), day);
        const dayEvents = getVisibleEvents().filter((entry) => eventOverlapsDay(entry, dayDate));
        if (dayEvents.length) {
            openEventModal(dayEvents[0].id);
        }
    }

    function handleSubmitEvent(event) {
        event.preventDefault();

        hideValidation();
        clearConflicts();

        const payload = {
            type: el.formType.value,
            bank: el.formBank.value,
            system: el.formSystem.value,
            impact: el.formImpact.value,
            start: el.formStart.value,
            end: el.formEnd.value,
            notes: el.formNotes.value.trim()
        };

        const errors = validateEventPayload(payload);
        if (errors.length) {
            showValidation(errors);
            return;
        }

        payload.durationHours = hoursBetween(payload.start, payload.end);

        const conflicts = detectConflicts(payload, state.editingId);
        if (conflicts.length) {
            showValidation([
                `Conflict detected: overlaps with ${conflicts.length} existing maintenance window(s) for same bank and system.`
            ]);
            showConflicts(conflicts);
            showToast('Resolve overlap conflicts before saving.', 'error');
            return;
        }

        if (state.editingId) {
            const index = state.events.findIndex((entry) => entry.id === state.editingId);
            if (index !== -1) {
                state.events[index] = {
                    ...state.events[index],
                    ...payload,
                    updatedAt: Date.now()
                };
                persistEvents();
                logActivity('update', 'Maintenance event updated.', `${state.events[index].id} · ${state.events[index].bank} · ${state.events[index].system}`);
                showToast(`Event ${state.events[index].id} updated.`, 'success');
            }
        } else {
            const id = nextEventId();
            state.events.push({
                id,
                ...payload,
                createdAt: Date.now(),
                updatedAt: Date.now()
            });
            persistEvents();
            logActivity('create', 'New maintenance event created.', `${id} · ${payload.bank} · ${payload.system}`);
            showToast(`Event ${id} added.`, 'success');
        }

        resetFormMode();
        toggleEventComposer(false);
        setActiveNav('reportsSection');
        renderAll();
    }

    function validateEventPayload(payload) {
        const errors = [];

        if (!payload.type || !['Planned', 'Emergency'].includes(payload.type)) {
            errors.push('Maintenance Type must be Planned or Emergency.');
        }
        if (!payload.bank) {
            errors.push('Bank field is required.');
        }
        if (!payload.system) {
            errors.push('System field is required.');
        }
        if (!payload.impact || !IMPACT_LEVELS.includes(payload.impact)) {
            errors.push('Impact level is required.');
        }
        if (!payload.start || !payload.end) {
            errors.push('Start and End datetime are required.');
        }

        if (payload.start && payload.end) {
            const startTs = new Date(payload.start).getTime();
            const endTs = new Date(payload.end).getTime();
            if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) {
                errors.push('Start or End datetime is invalid.');
            }
            if (startTs >= endTs) {
                errors.push('End datetime must be later than Start datetime.');
            }
            if (hoursBetween(payload.start, payload.end) > 72) {
                errors.push('Maintenance duration cannot exceed 72 hours in a single event. Split into multiple windows.');
            }
        }

        return errors;
    }

    function detectConflicts(candidate, ignoreId) {
        const candidateStart = new Date(candidate.start).getTime();
        const candidateEnd = new Date(candidate.end).getTime();

        return state.events.filter((event) => {
            if (ignoreId && event.id === ignoreId) {
                return false;
            }
            if (event.bank !== candidate.bank || event.system !== candidate.system) {
                return false;
            }
            const start = new Date(event.start).getTime();
            const end = new Date(event.end).getTime();
            return candidateStart < end && candidateEnd > start;
        });
    }

    function showConflicts(conflicts) {
        if (!el.conflictList) {
            return;
        }
        if (!conflicts.length) {
            clearConflicts();
            return;
        }

        el.conflictList.innerHTML = conflicts
            .map((conflict) => {
                return `<div class="conflict-item">
                    <strong>${escapeHtml(conflict.id)}</strong> overlaps on ${escapeHtml(conflict.bank)} / ${escapeHtml(conflict.system)}<br>
                    ${escapeHtml(formatDateTime(conflict.start))} to ${escapeHtml(formatDateTime(conflict.end))}
                </div>`;
            })
            .join('');
    }

    function clearConflicts() {
        if (!el.conflictList) {
            return;
        }
        el.conflictList.innerHTML = '<div class="empty-state">No overlap conflicts detected in current form values.</div>';
    }

    function beginEdit(eventId) {
        const entry = state.events.find((event) => event.id === eventId);
        if (!entry) {
            return;
        }

        toggleEventComposer(true);
        setActiveNav('eventComposer');

        state.editingId = eventId;
        el.formType.value = entry.type;
        el.formBank.value = entry.bank;
        el.formSystem.value = entry.system;
        el.formImpact.value = entry.impact;
        el.formStart.value = entry.start;
        el.formEnd.value = entry.end;
        el.formNotes.value = entry.notes || '';

        el.formTitle.textContent = `Edit Event ${entry.id}`;
        el.formHint.textContent = 'Update fields and save to apply changes.';
        el.formSubmitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
        el.cancelEditBtn.hidden = false;

        renderFormDuration();
        hideValidation();
        clearConflicts();
        document.getElementById('eventComposer').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clearAllEvents() {
        const total = state.events.length;
        if (!total) {
            showToast('No events available to clear.', 'warning');
            return;
        }

        const shouldClear = window.confirm(`Clear all ${total} maintenance events? This action cannot be undone.`);
        if (!shouldClear) {
            return;
        }

        state.events = [];
        persistEvents();
        resetFormMode();
        closeEventModal();
        state.pagination.page = 1;
        renderAll();
        logActivity('delete', 'All maintenance events cleared.', `${total} events removed`);
        showToast(`Cleared ${total} maintenance events.`, 'success');
    }

    function resetFormMode() {
        state.editingId = null;
        el.eventForm.reset();
        el.formTitle.textContent = 'Add Maintenance Event';
        el.formHint.textContent = 'Create planned or emergency maintenance windows with validation and overlap protection.';
        el.formSubmitBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Add Event';
        el.cancelEditBtn.hidden = true;
        hideValidation();
        renderFormDuration();
        clearConflicts();
    }

    function deleteEvent(eventId) {
        const entry = state.events.find((event) => event.id === eventId);
        if (!entry) {
            return;
        }

        const shouldDelete = window.confirm(`Delete ${entry.id} (${entry.bank} - ${entry.system})?`);
        if (!shouldDelete) {
            return;
        }

        state.events = state.events.filter((event) => event.id !== eventId);
        persistEvents();

        if (state.editingId === eventId) {
            resetFormMode();
        }

        logActivity('delete', 'Maintenance event deleted.', `${entry.id} · ${entry.bank} · ${entry.system}`);
        showToast(`Event ${entry.id} deleted.`, 'success');
        renderAll();
    }

    function openEventModal(eventId) {
        const entry = state.events.find((event) => event.id === eventId);
        if (!entry) {
            return;
        }

        state.selectedEventId = eventId;
        el.modalTitle.textContent = `Event ${entry.id} Details`;
        el.modalContent.innerHTML = `
            <div class="modal-grid">
                <div class="modal-item"><strong>Type</strong>${renderTypeChip(entry.type)}</div>
                <div class="modal-item"><strong>Impact</strong><span class="impact-chip">${escapeHtml(entry.impact)}</span></div>
                <div class="modal-item"><strong>Bank</strong>${escapeHtml(entry.bank)}</div>
                <div class="modal-item"><strong>System</strong>${escapeHtml(entry.system)}</div>
                <div class="modal-item"><strong>Start</strong>${escapeHtml(formatDateTime(entry.start))}</div>
                <div class="modal-item"><strong>End</strong>${escapeHtml(formatDateTime(entry.end))}</div>
                <div class="modal-item"><strong>Duration</strong>${entry.durationHours.toFixed(2)} hrs</div>
                <div class="modal-item"><strong>Updated</strong>${escapeHtml(formatDateTimeForHumans(entry.updatedAt))}</div>
            </div>
            <div class="modal-item">
                <strong>Notes</strong>
                ${entry.notes ? escapeHtml(entry.notes) : '<span class="muted">No notes provided.</span>'}
            </div>
        `;
        el.eventModal.classList.add('open');
    }

    function closeEventModal() {
        el.eventModal.classList.remove('open');
        state.selectedEventId = null;
    }

    async function exportDataSnapshot() {
        const snapshot = buildProjectDataDocument();
        const content = JSON.stringify(snapshot, null, 2);

        const directWriteDone = await writeSnapshotToLinkedFile(content);
        if (directWriteDone) {
            return;
        }
        showToast('Link data.json first, then Save to write directly to the project file.', 'warning', 5000);
    }

    async function linkProjectDataFile() {
        const handle = await getOrRequestDataFileHandle(true);
        if (!handle) {
            return;
        }
        showToast('data.json linked. Save now writes directly to this file.', 'success');
    }

    async function writeSnapshotToLinkedFile(content) {
        const handle = await getOrRequestDataFileHandle(false);
        if (!handle) {
            return false;
        }

        try {
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            logActivity('report', 'Project data saved.', `${state.events.length} events saved directly to data.json`);
            showToast('Saved directly to linked data.json file.', 'success');
            return true;
        } catch (error) {
            showToast('Direct save failed. Re-link data.json and try again.', 'error', 5000);
            state.linkedDataFileHandle = null;
            return false;
        }
    }

    async function getOrRequestDataFileHandle(forcePick) {
        if (!window.showOpenFilePicker) {
            return null;
        }

        if (!forcePick && state.linkedDataFileHandle) {
            const permission = await state.linkedDataFileHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                return state.linkedDataFileHandle;
            }
            const request = await state.linkedDataFileHandle.requestPermission({ mode: 'readwrite' });
            if (request === 'granted') {
                return state.linkedDataFileHandle;
            }
        }

        try {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                    description: 'JSON Files',
                    accept: { 'application/json': ['.json'] }
                }]
            });

            if (!handle) {
                return null;
            }

            if (handle.name !== 'data.json') {
                showToast('Tip: choose your project data.json file for direct Git-tracked saves.', 'warning', 5000);
            }

            const permission = await handle.requestPermission({ mode: 'readwrite' });
            if (permission !== 'granted') {
                showToast('Write permission denied for selected file.', 'warning');
                return null;
            }

            state.linkedDataFileHandle = handle;
            return handle;
        } catch (error) {
            if (error && error.name === 'AbortError') {
                return null;
            }
            showToast('Could not link data file. Use Save fallback download if needed.', 'warning', 5000);
            return null;
        }
    }

    function toSerializableEvent(event) {
        return {
            id: event.id,
            type: event.type,
            bank: event.bank,
            system: event.system,
            impact: event.impact,
            start: event.start,
            end: event.end,
            notes: event.notes || ''
        };
    }

    function buildProjectDataDocument() {
        const events = state.events
            .map(normalizeEvent)
            .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
            .map(toSerializableEvent);

        return {
            version: 1,
            updatedAt: new Date().toISOString(),
            events,
            activities: state.activities.slice(0, 100)
        };
    }

    function toggleDropdown(type) {
        if (state.openDropdown === type) {
            closeDropdowns();
            return;
        }

        closeDropdowns();
        state.openDropdown = type;

        if (type === 'bank') {
            el.bankDropdownMenu.classList.add('open');
        } else {
            el.systemDropdownMenu.classList.add('open');
        }
    }

    function closeDropdowns() {
        state.openDropdown = null;
        el.bankDropdownMenu.classList.remove('open');
        el.systemDropdownMenu.classList.remove('open');
    }

    function toggleSidebarCollapse() {
        state.meta.sidebarCollapsed = !state.meta.sidebarCollapsed;
        persistMeta();
        applyMetaToUI();
    }

    function applyMetaToUI() {
        el.sidebar.classList.toggle('collapsed', Boolean(state.meta.sidebarCollapsed && window.innerWidth > 960));
    }

    function toggleMobileSidebar() {
        const open = !el.sidebar.classList.contains('mobile-open');
        el.sidebar.classList.toggle('mobile-open', open);
        el.sidebarScrim.style.display = open ? 'block' : 'none';
    }

    function closeMobileSidebar() {
        el.sidebar.classList.remove('mobile-open');
        el.sidebarScrim.style.display = 'none';
    }

    function setActiveNav(targetId) {
        toggleEventComposer(targetId === 'eventComposer');
        el.navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('data-target') === targetId);
        });
    }

    function showValidation(errors) {
        el.validationList.innerHTML = errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('');
        el.validationBox.style.display = 'block';
    }

    function hideValidation() {
        el.validationBox.style.display = 'none';
        el.validationList.innerHTML = '';
    }

    function renderFormDuration() {
        if (!el.formStart.value || !el.formEnd.value) {
            el.formDuration.value = '0.00';
            return;
        }

        const duration = hoursBetween(el.formStart.value, el.formEnd.value);
        if (duration > 0) {
            el.formDuration.value = duration.toFixed(2);
        } else {
            el.formDuration.value = '0.00';
        }
    }

    function renderTypeChip(type) {
        const className = type === 'Emergency' ? 'status-chip emergency' : 'status-chip planned';
        const icon = type === 'Emergency' ? 'fa-bolt' : 'fa-screwdriver-wrench';
        return `<span class="${className}"><i class="fa-solid ${icon}"></i>${escapeHtml(type)}</span>`;
    }

    function hoursBetween(start, end) {
        const diffMs = new Date(end).getTime() - new Date(start).getTime();
        return diffMs > 0 ? diffMs / 3600000 : 0;
    }

    function sumDowntime(events) {
        return events.reduce((total, event) => total + Number(event.durationHours || 0), 0);
    }

    function calculateSla(totalDowntimeHours, referenceDate) {
        const year = referenceDate.getFullYear();
        const month = referenceDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const totalHours = daysInMonth * 24;
        const availableHours = Math.max(0, totalHours - totalDowntimeHours);
        const uptime = (availableHours / totalHours) * 100;
        return {
            totalHours,
            availableHours,
            uptime,
            compliant: uptime >= SLA_TARGET_UPTIME
        };
    }

    function downtimeHealth(hours) {
        if (hours > 40) {
            return 'critical';
        }
        if (hours > 20) {
            return 'warning';
        }
        return 'healthy';
    }

    function eventOverlapsDay(event, dayDate) {
        const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 0, 0, 0, 0).getTime();
        const dayEnd = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 23, 59, 59, 999).getTime();
        const start = new Date(event.start).getTime();
        const end = new Date(event.end).getTime();
        return start <= dayEnd && end >= dayStart;
    }

    function formatDateTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function formatDateTimeForHumans(timestamp) {
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return '-';
        }
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function isSameDate(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    function populateFormSelects() {
        el.formBank.innerHTML = BANKS.map((bank) => `<option value="${escapeHtml(bank)}">${escapeHtml(bank)}</option>`).join('');
        el.formSystem.innerHTML = SYSTEMS.map((system) => `<option value="${escapeHtml(system)}">${escapeHtml(system)}</option>`).join('');
        el.formImpact.innerHTML = IMPACT_LEVELS.map((impact) => `<option value="${escapeHtml(impact)}">${escapeHtml(impact)}</option>`).join('');
        clearConflicts();
    }

    function loadEvents(fileEvents = null) {
        if (Array.isArray(fileEvents) && fileEvents.length) {
            return fileEvents.map(normalizeEvent);
        }

        const fallback = () => {
            const seeded = seedEvents();
            safeWrite(STORAGE_KEYS.events, seeded);
            return seeded;
        };

        const raw = localStorage.getItem(STORAGE_KEYS.events);
        if (!raw) {
            return fallback();
        }

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('Stored event data is not an array.');
            }

            const valid = parsed.filter(isValidEventShape).map(normalizeEvent);
            if (!valid.length) {
                throw new Error('No valid events available after validation.');
            }

            if (valid.length !== parsed.length) {
                state.storageWarnings.push('Some stored events were invalid and have been ignored.');
                safeWrite(STORAGE_KEYS.events, valid);
            }
            return valid;
        } catch (error) {
            backupCorruptedData(STORAGE_KEYS.events, raw);
            state.storageWarnings.push('Events storage was corrupted and automatically recovered using seeded data.');
            return fallback();
        }
    }

    function loadActivities(fileActivities = null) {
        if (Array.isArray(fileActivities)) {
            return fileActivities.filter(isValidActivityShape).slice(0, 100);
        }

        const raw = localStorage.getItem(STORAGE_KEYS.activity);
        if (!raw) {
            return [];
        }

        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                throw new Error('Activity data invalid.');
            }

            return parsed
                .filter(isValidActivityShape)
                .slice(0, 100);
        } catch (error) {
            backupCorruptedData(STORAGE_KEYS.activity, raw);
            state.storageWarnings.push('Activity log storage was corrupted and has been reset.');
            safeWrite(STORAGE_KEYS.activity, []);
            return [];
        }
    }

    function loadMeta() {
        const raw = localStorage.getItem(STORAGE_KEYS.meta);
        if (!raw) {
            return { sidebarCollapsed: false };
        }
        try {
            const parsed = JSON.parse(raw);
            return {
                sidebarCollapsed: Boolean(parsed.sidebarCollapsed)
            };
        } catch (error) {
            backupCorruptedData(STORAGE_KEYS.meta, raw);
            return { sidebarCollapsed: false };
        }
    }

    function normalizeEvent(event) {
        const normalizedBank = event.bank === 'National Bank' ? 'The National Bank' : event.bank;
        return {
            ...event,
            bank: normalizedBank,
            durationHours: Number(hoursBetween(event.start, event.end).toFixed(3)),
            createdAt: event.createdAt || Date.now(),
            updatedAt: event.updatedAt || Date.now(),
            notes: event.notes || ''
        };
    }

    function persistEvents() {
        state.events = state.events.map(normalizeEvent);
        safeWrite(STORAGE_KEYS.events, state.events);
    }

    function persistMeta() {
        safeWrite(STORAGE_KEYS.meta, state.meta);
    }

    function logActivity(type, title, message) {
        const entry = {
            id: `ACT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            type,
            title,
            message,
            timestamp: Date.now()
        };
        state.activities.unshift(entry);
        state.activities = state.activities.slice(0, 100);
        safeWrite(STORAGE_KEYS.activity, state.activities);
    }

    function nextEventId() {
        let max = 3000;
        state.events.forEach((event) => {
            const number = Number(String(event.id).replace(/[^0-9]/g, ''));
            if (Number.isFinite(number) && number > max) {
                max = number;
            }
        });
        return `EVT-${max + 1}`;
    }

    function updateLastUpdated() {
        const now = new Date();
        el.lastUpdated.textContent = `Last updated ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    }

    function showToast(message, type = 'success', timeout = 3500) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<i class="fa-solid ${toastIcon(type)}"></i><span>${escapeHtml(message)}</span>`;
        el.toastStack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => toast.remove(), 220);
        }, timeout);
    }

    function toastIcon(type) {
        if (type === 'error') {
            return 'fa-triangle-exclamation';
        }
        if (type === 'warning') {
            return 'fa-circle-exclamation';
        }
        return 'fa-circle-check';
    }

    function safeWrite(key, payload) {
        try {
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (error) {
            showToast('Storage write failed. Browser quota may be full.', 'error');
        }
    }

    function backupCorruptedData(key, rawValue) {
        try {
            const backupKey = `${key}_recovery_${Date.now()}`;
            localStorage.setItem(backupKey, rawValue);
        } catch (error) {
            // Ignore backup failures caused by quota limits.
        }
    }

    function seedEvents() {
        const now = new Date();
        const month = now.getMonth();
        const year = now.getFullYear();

        const makeEvent = (id, dayOffset, startHour, duration, type, bank, system, impact, notes) => {
            const start = new Date(year, month, now.getDate() + dayOffset, startHour, 0, 0, 0);
            const end = new Date(start.getTime() + duration * 3600000);
            return {
                id,
                type,
                bank,
                system,
                impact,
                start: toDatetimeLocal(start),
                end: toDatetimeLocal(end),
                durationHours: duration,
                notes,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
        };

        return [
            makeEvent('EVT-3001', -5, 1, 2.5, 'Planned', 'Arab Bank', 'ECC', 'Medium', 'Scheduled schema optimization and patch cycle.'),
            makeEvent('EVT-3002', -2, 9, 4.5, 'Emergency', 'Bank of Palestine', 'National Switch', 'Critical', 'Switch instability caused ATM routing interruption.'),
            makeEvent('EVT-3003', 1, 22, 3, 'Planned', 'Quds Bank', 'ESADAD', 'Low', 'Rolling deployment and API gateway update.'),
            makeEvent('EVT-3004', 2, 14, 2, 'Planned', 'Safa Bank', 'IBURAQ', 'Medium', 'Performance tuning for clearing channel.'),
            makeEvent('EVT-3005', 4, 8, 6, 'Emergency', 'The National Bank', 'ECC', 'High', 'Database failover and node recovery.'),
            makeEvent('EVT-3006', 6, 23, 5, 'Planned', 'Cairo Amman Bank', 'National Switch', 'High', 'Nightly core network hardening.'),
            makeEvent('EVT-3007', 9, 11, 3.5, 'Planned', 'Bank of Palestine', 'IBURAQ', 'Medium', 'Message queue patching and restart.'),
            makeEvent('EVT-3008', 11, 7, 8, 'Emergency', 'Arab Bank', 'ESADAD', 'Critical', 'Unexpected service degradation due to hardware issue.')
        ];
    }

    function toDatetimeLocal(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
