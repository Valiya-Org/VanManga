<template>
  <div class="dh-field">
    <div class="van-hairline--bottom">
      <van-popup v-model="newVisibleShell" position="bottom" @click-overlay="close" class="" >
        <div class="van-picker__toolbar">
          <button type="button" class="van-picker__cancel" @click="cancel">取消</button>
          <div class="van-ellipsis van-picker__title">{{$attrs.label}}</div>
          <button type="button" class="van-picker__confirm" @click="onConfirm">确认</button>
        </div>
        <div style="max-height:600px; overflow-y:auto;">
          <van-field v-if="isSearch" v-model="searchVal" input-align="left" placeholder="搜索" @input="search"/>
          <van-cell title="全选">
            <template #right-icon>
              <van-checkbox v-model="checkedAll" name="all" @click="toggleAll"/>
            </template>
          </van-cell>
          <van-checkbox-group ref="checkboxGroup" v-model="checkboxValue" @change="change">
            <van-cell-group>
              <van-cell
                  v-for="(item, index) in columnsData"
                  :key="item[option.value]"
                  :title="item[option.label]"
                  clickable
                  @click="toggle(index)"
              >
                <template #right-icon>
                  <van-checkbox ref="checkboxes" :name="item[option.value]" />
                </template>
              </van-cell>
            </van-cell-group>
          </van-checkbox-group>
        </div>
      </van-popup>
    </div>
  </div>
</template>

<script>
export default {
  name: 'VanFieldCheckbox',
  model: {
    prop: 'selectValue'
  },
  props: {
    columns: {
      type: Array,
      default: function () {
        return []
      }
    },
    selectValue: {
      type: Array,
      default: function () {
        return []
      }
    },
    option: {
      type: Object,
      default: function () {
        return { label: 'label', value: 'value' }
      }
    },
    // 是否支持搜索
    isSearch: {
      type: Boolean,
      default: true
    },
    newVisible: {
      type: Boolean,
    }
  },
  computed: {
    resultLabel: {
      get () {
        const res = this.columns.filter(item => {
          return this.resultValue.indexOf(item[this.option.value]) > -1
        })
        const resLabel = res.map(item => {
          return item[this.option.label]
        })
        return resLabel.join(',')
      },
      set () {

      }
    }
  },
  data () {
    return {
      newVisibleShell: false,
      searchVal: '',
      columnsData: JSON.parse(JSON.stringify(this.columns)),
      checkboxValue: JSON.parse(JSON.stringify(this.selectValue)),
      checkedAll: false,
      resultValue: JSON.parse(JSON.stringify(this.selectValue))
    }
  },
  methods: {
    // 搜索
    search (val) {
      if (val) {
        this.columnsData = this.columnsData.filter(item => {
          return item[this.option.label].indexOf(val) > -1
        })
      } else {
        this.columnsData = JSON.parse(JSON.stringify(this.columns))
      }
    },
    getData (val) {
      const res = this.columnsData.filter(item => {
        return val.indexOf(item[this.option.value]) > -1
      })
      return res
    },
    onConfirm () {
      this.resultValue = this.checkboxValue
      this.$emit('confirm', this.resultValue, this.getData(this.resultValue))
    },
    change (val) {
      this.$emit('change', val, this.getData(this.resultValue))
    },
    cancel () {
      this.checkboxValue = [];
      this.columnsData = [];
      this.resultValue = [];
      this.$emit('cancel', this.resultValue)
      this.$emit("closeNewDir");
    },
    toggle (index) {
      this.$refs.checkboxes[index].toggle()
    },
    toggleAll () {
      this.$refs.checkboxGroup.toggleAll(this.checkedAll)
    },
    showPopu (disabled) {
      this.columnsData = JSON.parse(JSON.stringify(this.columns))
      this.checkboxValue = JSON.parse(JSON.stringify(this.selectValue))
      this.resultValue = JSON.parse(JSON.stringify(this.selectValue))
      if (disabled !== undefined && disabled !== false) {
        return false
      } else {
        this.close()
      }
    },
    close(){
      this.checkboxValue = [];
      this.columnsData = [];
      this.resultValue = [];
      this.$emit("closeNewDir");
    }
  },
  watch: {
    selectValue: function (newVal) {
      this.resultValue = newVal
    },
    resultValue (val) {
      this.searchVal = ''
      this.columnsData = JSON.parse(JSON.stringify(this.columns))
      this.$emit('input', val)
    },
    columns:{
      handler () {
        this.columnsData = JSON.parse(JSON.stringify(this.columns))
      },
      immediate: true
    },
    columnsData: {
      handler (val) {
        if (val.length && val.length === this.checkboxValue.length) {
          this.checkedAll = true
        } else {
          this.checkedAll = false
        }
      },
      immediate: true
    },
    checkboxValue: {
      handler (val) {
        if (val.length && val.length === this.columnsData.length) {
          this.checkedAll = true
        } else {
          this.checkedAll = false
        }
      },
      immediate: true
    },
    newVisible:{
      handler(val) {
        this.newVisibleShell = val;
      },
      immediate: true
    }
  }
}
</script>

<style lang="scss" scoped>
.dh-field {
  padding: 0;
  background:#fff;
  .dh-cell.van-cell {
    padding: 10px 0;
  }
  .dh-cell.van-cell--required::before {
    left: -8px;
  }
  .van-popup {
    border-radius: 20px 20px 0 0;
  }
}
</style>