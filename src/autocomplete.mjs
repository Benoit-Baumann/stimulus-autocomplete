import { Controller } from 'stimulus'
import debounce from 'lodash.debounce'

export default class extends Controller {
  static targets = ['input', 'hidden', 'results']

  connect () {
    this.resultsTarget.hidden = true

    this.inputTarget.setAttribute('autocomplete', 'off')
    this.inputTarget.setAttribute('spellcheck', 'false')

    this.mouseDown = false

    this.onInputChange = debounce(this.onInputChange.bind(this), 300)
    this.onResultsClick = this.onResultsClick.bind(this)
    this.onResultsMouseDown = this.onResultsMouseDown.bind(this)
    this.onInputBlur = this.onInputBlur.bind(this)
    this.onKeydown = this.onKeydown.bind(this)

    this.inputTarget.addEventListener('keydown', this.onKeydown)
    this.inputTarget.addEventListener('blur', this.onInputBlur)
    this.inputTarget.addEventListener('input', this.onInputChange)
    this.resultsTarget.addEventListener('mousedown', this.onResultsMouseDown)
    this.resultsTarget.addEventListener('click', this.onResultsClick)
  }

  disconnect () {
    this.inputTarget.removeEventListener('keydown', this.onKeydown)
    this.inputTarget.removeEventListener('focus', this.onInputFocus)
    this.inputTarget.removeEventListener('blur', this.onInputBlur)
    this.inputTarget.removeEventListener('input', this.onInputChange)
    this.resultsTarget.removeEventListener('mousedown', this.onResultsMouseDown)
    this.resultsTarget.removeEventListener('click', this.onResultsClick)
  }

  sibling (next) {
    const options = Array.from(this.resultsTarget.querySelectorAll('[role="option"]'))
    const selected = this.resultsTarget.querySelector('[aria-selected="true"]')
    const index = options.indexOf(selected)
    const sibling = next ? options[index + 1] : options[index - 1]
    const def = next ? options[0] : options[options.length - 1]
    return sibling || def
  }

  select (target) {
    for (const el of this.resultsTarget.querySelectorAll('[aria-selected="true"]')) {
      el.removeAttribute('aria-selected')
      el.classList.remove('active')
    }
    target.setAttribute('aria-selected', 'true')
    target.classList.add('active')
    this.inputTarget.setAttribute('aria-activedescendant', target.id)
  }

  onKeydown (event) {
    switch (event.key) {
      case 'Escape':
        if (!this.resultsTarget.hidden) {
          this.hideAndRemoveOptions()
          event.stopPropagation()
          event.preventDefault()
        }
        break
      case 'ArrowDown':
        {
          const item = this.sibling(true)
          if (item) this.select(item)
          event.preventDefault()
        }
        break
      case 'ArrowUp':
        {
          const item = this.sibling(false)
          if (item) this.select(item)
          event.preventDefault()
        }
        break
      case 'Tab':
        {
          const selected = this.resultsTarget.querySelector('[aria-selected="true"]')
          if (selected) {
            this.commit(selected)
          }
        }
        break
      case 'Enter':
        {
          const selected = this.resultsTarget.querySelector('[aria-selected="true"]')
          if (selected && !this.resultsTarget.hidden) {
            this.commit(selected)
            event.preventDefault()
          }
        }
        break
    }
  }

  onInputBlur () {
    if (this.mouseDown) return
    this.resultsTarget.hidden = true
    if (!this.hiddenTarget.value) this.inputTarget.value = ""
  }

  commit (selected) {
    if (selected.getAttribute('aria-disabled') === 'true') return

    if (selected instanceof HTMLAnchorElement) {
      selected.click()
      this.resultsTarget.hidden = true
      return
    }

    const textValue = selected.firstElementChild ? selected.firstElementChild.textContent.trim() : selected.textContent.trim()
    const value = selected.getAttribute('data-autocomplete-value') || textValue
    this.inputTarget.value = textValue

    if (this.hasHiddenTarget) {
      this.hiddenTarget.value = value
    } else {
      this.inputTarget.value = value
    }

    this.inputTarget.focus()
    this.hideAndRemoveOptions()

    this.element.dispatchEvent(new CustomEvent('autocomplete.change', {
      bubbles: true,
      detail: { value: value, textValue: textValue }
    }))
  }

  onResultsClick (event) {
    if (!(event.target instanceof Element)) return
    const selected = event.target.closest('[role="option"]')
    if (selected) this.commit(selected)
  }

  onResultsMouseDown () {
    this.mouseDown = true
    this.resultsTarget.addEventListener('mouseup', () => (this.mouseDown = false), { once: true })
  }

  onInputChange () {
    this.hiddenTarget.removeAttribute('value')
    this.fetchResults()
  }

  identifyOptions () {
    let id = 0
    for (const el of this.resultsTarget.querySelectorAll('[role="option"]:not([id])')) {
      el.id = `${this.resultsTarget.id}-option-${id++}`
    }
  }

  hideAndRemoveOptions () {
    this.resultsTarget.hidden = true
    this.resultsTarget.innerHTML = null
  }

  fetchResults () {
    const query = this.inputTarget.value.trim()
    if (!query || query.length < this.minLength) {
      this.hideAndRemoveOptions()
      return
    }

    if (!this.src) return

    const url = new URL(this.src, window.location.href)
    const params = new URLSearchParams(url.search.slice(1))
    params.append(this.searchKey, query)
    url.search = params.toString()

    this.element.dispatchEvent(new CustomEvent('loadstart'))

    fetch(url.toString())
      .then(response => response.text())
      .then(html => {
        this.resultsTarget.innerHTML = html
        this.identifyOptions()
        const hasResults = !!this.resultsTarget.querySelector('[role="option"]')
        this.resultsTarget.hidden = !hasResults
        this.element.dispatchEvent(new CustomEvent('load'))
        this.element.dispatchEvent(new CustomEvent('loadend'))
      })
      .catch(() => {
        this.element.dispatchEvent(new CustomEvent('error'))
        this.element.dispatchEvent(new CustomEvent('loadend'))
      })
  }

  open () {
    if (!this.resultsTarget.hidden) return
    this.resultsTarget.hidden = false
    this.element.setAttribute('aria-expanded', 'true')
    this.element.dispatchEvent(new CustomEvent('toggle', { detail: { input: this.input, results: this.results } }))
  }

  close () {
    if (this.resultsTarget.hidden) return
    this.resultsTarget.hidden = true
    this.inputTarget.removeAttribute('aria-activedescendant')
    this.element.setAttribute('aria-expanded', 'false')
    this.element.dispatchEvent(new CustomEvent('toggle', { detail: { input: this.input, results: this.results } }))
  }

  get src () {
    return this.data.get("url")
  }

  get searchKey () {
    return this.data.get("search") || 'q'
  }

  get minLength () {
    const minLength = this.data.get("min-length")
    if (!minLength) {
      return 0
    }
    return parseInt(minLength, 10)
  }
}
