<template>
  <div class="animated-select" :class="{ 'is-open': isOpen, 'is-disabled': disabled }" ref="selectRef">
    <div class="select-trigger" @click="toggleDropdown">
      <span class="select-value" :class="{ 'is-placeholder': !hasValue }">
        {{ displayLabel }}
      </span>
      <svg class="select-arrow" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.27a.75.75 0 01.02-1.06z" fill="currentColor"/>
      </svg>
    </div>
    
    <Transition name="select-dropdown-fade">
      <div v-show="isOpen" class="select-dropdown">
        <ul class="select-options">
          <li 
            v-if="placeholder" 
            class="select-option select-option-placeholder" 
            @click="selectOption('')"
          >
            {{ placeholder }}
          </li>
          <li 
            v-for="opt in normalizedOptions" 
            :key="opt.value" 
            class="select-option" 
            :class="{ 'is-selected': modelValue === opt.value }"
            @click="selectOption(opt.value)"
          >
            {{ opt.label }}
          </li>
        </ul>
      </div>
    </Transition>
  </div>
</template>

<script>
export default {
  name: 'AnimatedSelect',
  props: {
    modelValue: {
      type: [String, Number],
      default: ''
    },
    options: {
      type: Array,
      default: () => []
    },
    placeholder: {
      type: String,
      default: ''
    },
    disabled: {
      type: Boolean,
      default: false
    }
  },
  emits: ['update:modelValue', 'change'],
  data() {
    return {
      isOpen: false
    }
  },
  computed: {
    normalizedOptions() {
      return this.options.map(opt => {
        if (typeof opt === 'object' && opt !== null) {
          return { label: opt.label, value: opt.value };
        }
        return { label: String(opt), value: opt };
      });
    },
    hasValue() {
      return this.modelValue !== '' && this.modelValue !== null && this.modelValue !== undefined;
    },
    displayLabel() {
      if (!this.hasValue) {
        return this.placeholder || '请选择';
      }
      const selected = this.normalizedOptions.find(opt => opt.value === this.modelValue);
      return selected ? selected.label : String(this.modelValue);
    }
  },
  mounted() {
    document.addEventListener('click', this.handleClickOutside);
  },
  beforeUnmount() {
    document.removeEventListener('click', this.handleClickOutside);
  },
  methods: {
    toggleDropdown() {
      if (this.disabled) return;
      this.isOpen = !this.isOpen;
    },
    selectOption(val) {
      if (this.modelValue !== val) {
        this.$emit('update:modelValue', val);
        this.$emit('change', val);
      }
      this.isOpen = false;
    },
    handleClickOutside(event) {
      if (this.isOpen && this.$refs.selectRef && !this.$refs.selectRef.contains(event.target)) {
        this.isOpen = false;
      }
    }
  }
}
</script>

<style scoped>
.animated-select {
  position: relative;
  width: 100%;
  font-size: 14px;
  box-sizing: border-box;
}

.animated-select.is-open {
  z-index: 60;
}

.select-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 9px 10px;
  background: #fff;
  cursor: pointer;
  box-sizing: border-box;
  min-height: 38px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease;
}

.is-disabled .select-trigger {
  background: #f3f4f6;
  cursor: not-allowed;
  color: #9ca3af;
}

.animated-select.is-open .select-trigger {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.select-value {
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.select-value.is-placeholder {
  color: #9ca3af;
}

.select-arrow {
  width: 16px;
  height: 16px;
  color: #9ca3af;
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
  margin-left: 8px;
}

.animated-select.is-open .select-arrow {
  transform: rotate(180deg);
  color: #3b82f6;
}

.select-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  width: 100%;
  max-height: 240px;
  overflow-y: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
  z-index: 50;
  padding: 4px 0;
}

.select-dropdown::-webkit-scrollbar {
  width: 6px;
}
.select-dropdown::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
.select-dropdown::-webkit-scrollbar-track {
  background: transparent;
}

.select-options {
  list-style: none;
  margin: 0;
  padding: 0;
}

.select-option {
  padding: 8px 12px;
  cursor: pointer;
  color: #374151;
  transition: background-color 0.15s ease, color 0.15s ease;
  display: flex;
  align-items: center;
}

.select-option:hover {
  background-color: #f3f4f6;
  color: #111827;
}

.select-option.is-selected {
  background-color: #eff6ff;
  color: #2563eb;
  font-weight: 600;
}

.select-option-placeholder {
  color: #6b7280;
  font-style: italic;
}

.select-dropdown-fade-enter-active,
.select-dropdown-fade-leave-active {
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform-origin: top center;
}

.select-dropdown-fade-enter-from,
.select-dropdown-fade-leave-to {
  opacity: 0;
  transform: scaleY(0.95) translateY(-4px);
}
</style>
