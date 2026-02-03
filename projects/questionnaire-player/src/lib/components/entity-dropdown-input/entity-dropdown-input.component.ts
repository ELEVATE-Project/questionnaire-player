import { Component, Input, Output, OnInit, OnDestroy, ViewChild, ElementRef, HostListener, EventEmitter, TemplateRef } from '@angular/core';
import { FormControl, FormGroup, FormArray, Validators } from '@angular/forms';
import { Question, Validation } from '../../interfaces/questionnaire.type';
import { QuestionnaireService } from '../../services/questionnaire.service';
import { ApiService } from '../../services/api.service';
import { HttpParams, HttpHeaders } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { of } from 'rxjs';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';

interface EntityOption {
  label: string;
  value: string;
}

interface ApiResponse {
  result?: {
    data?: any[];
    count?: number;
    totalCount?: number;
  };
  users?: any[];
  data?: any[];
  count?: number;
  totalCount?: number;
  total?: number;
  skip?: number;
  limit?: number;
}

@Component({
  selector: 'lib-entity-dropdown-input',
  templateUrl: './entity-dropdown-input.component.html',
  styleUrls: ['./entity-dropdown-input.component.scss']
})
export class EntityDropdownInputComponent implements OnInit, OnDestroy {
  @Input() questionnaireForm: FormGroup;
  @Input() question: Question;
  @Output() dependentParent = new EventEmitter<Question>();
  @ViewChild('modalTemplate') modalTemplate: TemplateRef<any>;

  // Multi-select support
  selectedOptions: EntityOption[] = [];
  selectedOption: EntityOption | null = null;
  
  // Modal state
  modalRef: MatDialogRef<any> | null = null;
  isModalOpen = false;
  
  // Options and filtering
  options: EntityOption[] = [];
  filteredOptions: EntityOption[] = [];
  isLoading = false;
  hasMore = true;
  currentPage = 1;
  searchTerm = '';
  errorMessage = '';
  pageSize = 20;
  
  // Temporary selection state for modal (before confirming)
  tempSelectedValues: Set<string> = new Set();

  private searchSubject = new Subject<string>();
  private destroy$ = new Subject<void>();

  constructor(
    public qService: QuestionnaireService,
    private apiService: ApiService,
    private dialog: MatDialog
  ) {}

  get isMultiSelect(): boolean {
    return this.question.responseType === 'multiselect';
  }

  ngOnInit() {
    // Initialize form control based on multi-select mode
    setTimeout(() => {
      if (this.isMultiSelect) {
        // Multi-select: Use FormArray
        const questionValue = Array.isArray(this.question.value) 
          ? this.question.value 
          : this.question.value 
            ? [this.question.value] 
            : [];
        
        // Create FormArray with FormControls for each selected value
        // If no values, create empty FormArray (validation will handle required check)
        const formControls = questionValue.length > 0
          ? questionValue.map(val => new FormControl(val))
          : [];
        
        const formArray = new FormArray(formControls, this.qService.validate(this.question));
        
        this.questionnaireForm.addControl(this.question._id, formArray);
        
        // Store selected options
        if (questionValue.length > 0) {
          this.selectedOptions = questionValue.map(val => ({ label: '', value: String(val) }));
          this.fetchSelectedOptions(questionValue);
        } else {
          this.selectedOptions = [];
        }
      } else {
        // Single-select: Use FormControl
        this.questionnaireForm.addControl(
          this.question._id,
          new FormControl(this.question.value || null, [
            this.qService.validate(this.question)
          ])
        );

        // Set initial value if exists
        if (this.question.value) {
          const selectedValue = String(this.question.value);
          this.selectedOption = { label: '', value: selectedValue };
          this.fetchSelectedOption(selectedValue);
        }
      }

      this.question.startTime = this.question.startTime
        ? this.question.startTime
        : Date.now();
    });

    // Setup search debounce
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((searchTerm) => {
        this.searchTerm = searchTerm;
        this.currentPage = 1;
        this.options = [];
        this.fetchEntities();
      });

    // Load initial data if dropdown is opened
    const metaConfig = this.getMetaConfig();
    if (metaConfig?.paginationEnabled !== false) {
      this.pageSize = metaConfig?.pagination?.defaultLimit || 20;
    } else {
      this.pageSize = metaConfig?.pagination?.defaultLimit || 20;
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.modalRef) {
      this.modalRef.close();
    }
  }

  /**
   * Check if the API URL is a full URL (starts with http:// or https://)
   */
  private isFullUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  /**
   * Get metaInformation config
   */
  private getMetaConfig(): any {
    return (this.question as any).metaInformation?.config;
  }

  /**
   * Validate config and check for missing required values
   */
  private validateConfig(): { isValid: boolean; missingFields: string[] } {
    const metaConfig = this.getMetaConfig();
    const missingFields: string[] = [];

    // Check if apiEndPoint is configured
    if (!metaConfig?.apiEndPoint) {
      missingFields.push('apiEndPoint');
    }

    // Check if baseUrl is available when apiDomain is empty
    if (!metaConfig?.apiDomain && !this.apiService.baseUrl) {
      missingFields.push('baseUrl');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields
    };
  }

  /**
   * Check if API endpoint is configured in metaInformation.config.apiEndPoint
   */
  private hasApiEndpoint(): boolean {
    const metaConfig = this.getMetaConfig();
    return !!metaConfig?.apiEndPoint;
  }

  /**
   * Build HTTP headers with x-auth-token from apiConfig
   */
  private buildHeaders(): HttpHeaders {
    const token = this.apiService.userAuthToken || this.apiService.token;
    const headers: { [key: string]: string } = {};
    
    if (token) {
      headers['x-auth-token'] = token;
    }
    
    return new HttpHeaders(headers);
  }

  /**
   * Build the API URL based on apiDomain and apiEndPoint configuration
   * If apiDomain is empty, use apiService.baseUrl
   */
  private buildApiUrl(): string {
    const metaConfig = this.getMetaConfig();
    const apiDomain = metaConfig?.apiDomain;
    const apiEndPoint = metaConfig?.apiEndPoint;
    
    if (!apiEndPoint) {
      return '';
    }
    
    // If apiDomain is provided and not empty, use apiDomain + apiEndPoint
    if (apiDomain && apiDomain.trim() !== '') {
      return apiDomain + apiEndPoint;
    }
    
    // If apiEndPoint is already a full URL, return it as is
    if (this.isFullUrl(apiEndPoint)) {
      return apiEndPoint;
    }
    
    // Otherwise, construct URL using baseUrl + endpoint
    return this.apiService.baseUrl ? this.apiService.baseUrl + apiEndPoint : apiEndPoint;
  }

  fetchEntities() {
    // Validate config first
    const validation = this.validateConfig();
    if (!validation.isValid) {
      this.errorMessage = `Missing required configuration: ${validation.missingFields.join(', ')}`;
      return;
    }

    if (!this.hasApiEndpoint()) {
      this.errorMessage = 'API endpoint not configured';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    const metaConfig = this.getMetaConfig();
    const paginationConfig = metaConfig?.pagination;
    const searchConfig = metaConfig?.search;
    
    // Use pagination config if available, otherwise use defaults
    const pageSize = paginationConfig?.defaultLimit || this.pageSize;
    const skip = (this.currentPage - 1) * pageSize;
    
    let params = new HttpParams();
    
    // Add pagination params based on config
    if (metaConfig?.paginationEnabled !== false) {
      const pageParam = paginationConfig?.pageParam || 'page';
      const limitParam = paginationConfig?.limitParam || 'limit';
      params = params.set(pageParam, this.currentPage.toString());
      params = params.set(limitParam, pageSize.toString());
    } else {
      // Fallback to skip/limit if pagination config not available
      params = params.set('skip', skip.toString());
      params = params.set('limit', pageSize.toString());
    }

    // Add search params based on config
    if (this.searchTerm && metaConfig?.searchEnabled !== false) {
      const searchParam = searchConfig?.param || 'q';
      params = params.set(searchParam, this.searchTerm);
    }

    const apiUrl = this.buildApiUrl();
    const headers = this.buildHeaders();
    
    // Use full URL method if API is a complete URL, otherwise use relative path
    const apiCall = this.isFullUrl(apiUrl)
      ? this.apiService.getWithFullURL<ApiResponse>(apiUrl, params, headers)
      : this.apiService.get<ApiResponse>(apiUrl, params, headers);

    apiCall
      .pipe(
        catchError((error) => {
          console.error('Error fetching entities:', error);
          this.errorMessage = 'Failed to load options. Please try again.';
          this.isLoading = false;
          return of(null);
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        this.isLoading = false;
        if (!response) {
          return;
        }
        
        // Handle different response structures
        let data: any[] = [];
        if (Array.isArray(response)) {
          data = response;
        } else if (response.result?.data) {
          data = response.result.data;
        } else if (response.users) {
          data = response.users;
        } else if (response.data && !Array.isArray(response.data) && (response.data as any).users) {
          data = (response.data as any).users;
        } else if (response.data) {
          data = Array.isArray(response.data) ? response.data : [];
        }
        console.log('data',response);
        const totalCount = response.result?.totalCount || response.result?.count || (response as any).total || response.totalCount || response.count || 0;

        // Map response to options
        const newOptions = this.mapResponseToOptions(data as any[]);
        
        if (this.currentPage === 1) {
          this.options = newOptions;
        } else {
          this.options = [...this.options, ...newOptions];
        }

        // Check if there are more pages
        const metaConfig = this.getMetaConfig();
        const paginationEnabled = metaConfig?.paginationEnabled !== false;
        this.hasMore = paginationEnabled && this.options.length < totalCount;

        this.filteredOptions = this.options;
      });
  }

  /**
   * Parse and evaluate complex labelKey expressions
   * Format: "firstName,' ',lastName,' - ',company.name"
   * - Elements separated by commas
   * - Quoted elements (like ' ' or ' - ') are literal strings, concatenate as-is
   * - Unquoted elements (like firstName or company.name) are field paths from the object
   * 
   * Example: "firstName,' ',lastName,' - ',company.name"
   * Returns: "Emily Johnson - Dooley, Kozey and Cronin"
   */
  private parseLabelKey(item: any, labelKey: string): string {
    // If labelKey contains commas, it's a complex expression (array-like format)
    if (labelKey.includes(',')) {
      // Parse the expression: split by comma, but preserve quoted strings
      const parts: string[] = [];
      let currentPart = '';
      let inQuotes = false;
      
      for (let i = 0; i < labelKey.length; i++) {
        const char = labelKey[i];
        if (char === "'") {
          // Check if this is an escaped quote (two consecutive quotes)
          if (inQuotes && i + 1 < labelKey.length && labelKey[i + 1] === "'") {
            // Escaped quote - add single quote to currentPart
            currentPart += "'";
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
            // Include the quote character in currentPart so we can identify quoted parts later
            currentPart += char;
          }
        } else if (char === ',' && !inQuotes) {
          // End of current part (comma outside quotes)
          if (currentPart.trim()) {
            parts.push(currentPart.trim());
          }
          currentPart = '';
        } else {
          // Regular character - add to current part
          currentPart += char;
        }
      }
      
      // Add last part (after final comma or end of string)
      if (currentPart.trim()) {
        parts.push(currentPart.trim());
      }
      
      // Evaluate each part and concatenate
      return parts.map(part => {
        const trimmedPart = part.trim();
        
        // Check if part is quoted (starts and ends with single quotes)
        if (trimmedPart.startsWith("'") && trimmedPart.endsWith("'") && trimmedPart.length >= 2) {
          // It's a literal string - remove surrounding quotes and return as-is
          return trimmedPart.slice(1, -1);
        } else {
          // It's a field path (e.g., "firstName" or "company.name")
          // Get the value from the object using dot notation
          return this.getNestedValue(item, trimmedPart) || '';
        }
      }).join('');
    } else {
      // Simple field access (backward compatibility - no commas means single field)
      return this.getNestedValue(item, labelKey) || '';
    }
  }

  /**
   * Get nested value from object using dot notation
   * Example: getNestedValue(item, "company.name") returns item.company.name
   */
  private getNestedValue(obj: any, path: string): any {
    if (!obj || !path) return '';
    
    const keys = path.split('.');
    let value = obj;
    
    for (const key of keys) {
      if (value === null || value === undefined) {
        return '';
      }
      value = value[key];
    }
    
    return value !== null && value !== undefined ? String(value) : '';
  }

  mapResponseToOptions(data: any[]): EntityOption[] {
    const metaConfig = this.getMetaConfig();
    const mapping = metaConfig?.mapping || {};
    // Remove quotes from label if it's wrapped in quotes (e.g., "\"name,' - ',status\"")
    let labelKey = mapping?.label || 'name';
    if (labelKey.startsWith('"') && labelKey.endsWith('"')) {
      labelKey = labelKey.slice(1, -1);
    }
    const valueKey = mapping?.value || 'id';

    return data.map((item) => ({
      label: this.parseLabelKey(item, labelKey) || String(this.getNestedValue(item, valueKey)),
      value: String(this.getNestedValue(item, valueKey))
    }));
  }

  openModal() {
    // Initialize temp selection with current selections
    this.tempSelectedValues.clear();
    if (this.isMultiSelect) {
      this.selectedOptions.forEach(opt => this.tempSelectedValues.add(opt.value));
    } else if (this.selectedOption) {
      this.tempSelectedValues.add(this.selectedOption.value);
    }

    // Always reset pagination and load entities when modal opens
    // This ensures fresh data is loaded, especially in edit mode
    this.currentPage = 1;
    this.searchTerm = '';
    this.options = [];
    this.filteredOptions = [];
    this.hasMore = true;
    
    // Load entities when modal opens
    if (!this.isLoading) {
      this.fetchEntities();
    }

    // Open modal dialog
    this.modalRef = this.dialog.open(this.modalTemplate, {
      width: '600px',
      maxWidth: '90vw',
      maxHeight: '90vh',
      disableClose: false
    });

    this.isModalOpen = true;

    this.modalRef.afterClosed().subscribe(() => {
      this.isModalOpen = false;
      this.modalRef = null;
    });
  }

  closeModal() {
    if (this.modalRef) {
      this.modalRef.close();
    }
  }

  isSelected(value: string): boolean {
    return this.tempSelectedValues.has(value);
  }

  toggleSelection(option: EntityOption) {
    if (this.isMultiSelect) {
      // Multi-select: toggle checkbox
      if (this.tempSelectedValues.has(option.value)) {
        this.tempSelectedValues.delete(option.value);
      } else {
        this.tempSelectedValues.add(option.value);
      }
    } else {
      // Single-select: radio button behavior
      this.tempSelectedValues.clear();
      this.tempSelectedValues.add(option.value);
    }
  }

  confirmSelection() {
    const selectedValues = Array.from(this.tempSelectedValues);
    
    if (this.isMultiSelect) {
      // Update FormArray
      const formArray = this.questionnaireForm.get(this.question._id) as FormArray;
      formArray.clear();
      
      selectedValues.forEach(value => {
        formArray.push(new FormControl(value));
      });

      // Update selectedOptions with labels
      this.selectedOptions = selectedValues.map(value => {
        const option = this.options.find(opt => opt.value === value);
        return option || { label: value, value };
      });

      // Update question value
      this.question.value = selectedValues;
    } else {
      // Single-select: update FormControl
      const selectedValue = selectedValues[0] || null;
      const formControl = this.questionnaireForm.get(this.question._id) as FormControl;
      formControl.setValue(selectedValue);
      
      // Update selectedOption with label
      if (selectedValue) {
        const option = this.options.find(opt => opt.value === selectedValue);
        this.selectedOption = option || { label: selectedValue, value: selectedValue };
        this.question.value = selectedValue;
      } else {
        this.selectedOption = null;
        this.question.value = '';
      }
    }

    this.question.endTime = Date.now();

    // Trigger dependent questions if any
    if (this.question.children && this.question.children.length > 0) {
      this.dependentParent.emit(this.question);
    }

    this.closeModal();
  }

  removeSelectedOption(value: string) {
    if (this.isMultiSelect) {
      // Remove from FormArray
      const formArray = this.questionnaireForm.get(this.question._id) as FormArray;
      const index = this.selectedOptions.findIndex(opt => opt.value === value);
      if (index !== -1) {
        formArray.removeAt(index);
        this.selectedOptions.splice(index, 1);
        
        // Update question value
        this.question.value = this.selectedOptions.map(opt => opt.value);
      }
    } else {
      // Single-select: clear selection
      const formControl = this.questionnaireForm.get(this.question._id) as FormControl;
      formControl.setValue(null);
      this.selectedOption = null;
      this.question.value = '';
    }

    this.question.endTime = Date.now();

    // Trigger dependent questions if any
    if (this.question.children && this.question.children.length > 0) {
      this.dependentParent.emit(this.question);
    }
  }

  loadMore() {
    if (!this.isLoading && this.hasMore) {
      this.currentPage++;
      this.fetchEntities();
    }
  }

  onScroll(event: Event) {
    const element = event.target as HTMLElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    // Load more when scrolled to bottom (within 50px)
    if (scrollTop + clientHeight >= scrollHeight - 50 && this.hasMore && !this.isLoading) {
      this.loadMore();
    }
  }

  onSearchChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.searchSubject.next(value);
  }

  fetchSelectedOption(selectedValue: string) {
    if (!selectedValue || !this.hasApiEndpoint()) {
      return;
    }

    // Try to find in already loaded options
    const existingOption = this.options.find(opt => opt.value === selectedValue);
    if (existingOption) {
      this.selectedOption = existingOption;
      return;
    }

    // Load first page and check if selected value is there
    const metaConfig = this.getMetaConfig();
    const paginationConfig = metaConfig?.pagination;
    const pageSize = paginationConfig?.defaultLimit || this.pageSize;
    
    let params = new HttpParams();
    if (metaConfig?.paginationEnabled !== false && paginationConfig) {
      const pageParam = paginationConfig?.pageParam || 'page';
      const limitParam = paginationConfig?.limitParam || 'limit';
      params = params.set(pageParam, '1');
      params = params.set(limitParam, pageSize.toString());
    } else {
      params = params.set('skip', '0');
      params = params.set('limit', pageSize.toString());
    }
    
    const apiUrl = this.buildApiUrl();
    const headers = this.buildHeaders();
    const apiCall = this.isFullUrl(apiUrl)
      ? this.apiService.getWithFullURL<ApiResponse>(apiUrl, params, headers)
      : this.apiService.get<ApiResponse>(apiUrl, params, headers);

    apiCall
      .pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (response) {
          let data: any[] = [];
          if (Array.isArray(response)) {
            data = response;
          } else if (response.result?.data) {
            data = response.result.data;
          } else if (response.users) {
            data = response.users;
          } else if (response.data) {
            data = Array.isArray(response.data) ? response.data : [];
          }
          const options = this.mapResponseToOptions(data);
          this.options = options;
          
          // Try to find selected option
          const foundOption = options.find(opt => opt.value === selectedValue);
          if (foundOption) {
            this.selectedOption = foundOption;
          } else {
            // If not found in first page, try fetching by ID if API supports it
            const idParams = new HttpParams().set('id', selectedValue);
            const idHeaders = this.buildHeaders();
            const idApiCall = this.isFullUrl(apiUrl)
              ? this.apiService.getWithFullURL<ApiResponse>(apiUrl, idParams, idHeaders)
              : this.apiService.get<ApiResponse>(apiUrl, idParams, idHeaders);
            
            idApiCall
              .pipe(
                catchError(() => of(null)),
                takeUntil(this.destroy$)
              )
              .subscribe((idResponse) => {
                if (idResponse) {
                  let idData: any[] = [];
                  if (Array.isArray(idResponse)) {
                    idData = idResponse;
                  } else if (idResponse.result?.data) {
                    idData = idResponse.result.data;
                  } else if (idResponse.users) {
                    idData = idResponse.users;
                  } else if (idResponse.data) {
                    idData = Array.isArray(idResponse.data) ? idResponse.data : [];
                  }
                  if (idData.length > 0) {
                    const idOptions = this.mapResponseToOptions(idData);
                    if (idOptions.length > 0 && idOptions[0].value === selectedValue) {
                      this.selectedOption = idOptions[0];
                    }
                  }
                }
              });
          }
        }
      });
  }

  fetchSelectedOptions(selectedValues: string[]) {
    if (!selectedValues.length || !this.hasApiEndpoint()) {
      return;
    }

    // Load first page and check if selected values are there
    const metaConfig = this.getMetaConfig();
    const paginationConfig = metaConfig?.pagination;
    const pageSize = paginationConfig?.defaultLimit || this.pageSize;
    
    let params = new HttpParams();
    if (metaConfig?.paginationEnabled !== false && paginationConfig) {
      const pageParam = paginationConfig?.pageParam || 'page';
      const limitParam = paginationConfig?.limitParam || 'limit';
      params = params.set(pageParam, '1');
      params = params.set(limitParam, pageSize.toString());
    } else {
      params = params.set('skip', '0');
      params = params.set('limit', pageSize.toString());
    }
    
    const apiUrl = this.buildApiUrl();
    const headers = this.buildHeaders();
    const apiCall = this.isFullUrl(apiUrl)
      ? this.apiService.getWithFullURL<ApiResponse>(apiUrl, params, headers)
      : this.apiService.get<ApiResponse>(apiUrl, params, headers);

    apiCall
      .pipe(
        catchError(() => of(null)),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        if (response) {
          let data: any[] = [];
          if (Array.isArray(response)) {
            data = response;
          } else if (response.result?.data) {
            data = response.result.data;
          } else if (response.users) {
            data = response.users;
          } else if (response.data) {
            data = Array.isArray(response.data) ? response.data : [];
          }
          const options = this.mapResponseToOptions(data);
          this.options = options;
          
          // Update selectedOptions with labels
          this.selectedOptions = this.selectedOptions.map(selected => {
            const found = options.find(opt => opt.value === selected.value);
            return found || selected;
          });
        }
      });
  }

  get displayValue(): string {
    if (this.isMultiSelect) {
      return this.selectedOptions.length > 0 
        ? `${this.selectedOptions.length} selected` 
        : '';
    }
    return this.selectedOption ? this.selectedOption.label : '';
  }

  get isValid(): boolean {
    return this.questionnaireForm.controls[this.question._id]?.valid || false;
  }

  get isTouched(): boolean {
    return this.questionnaireForm.controls[this.question._id]?.touched || false;
  }

  getValidationMessage(controlName: string): string {
    const control = this.questionnaireForm.get(controlName);
    if (control?.errors) {
      const validationErrors = control.errors;
      if (validationErrors['err']) {
        return validationErrors['err'];
      }
    }
    return '';
  }

  get modalTitle(): string {
    const metaConfig = this.getMetaConfig();
    const entityType = metaConfig?.entityType || 'Participants';
    return `Select ${entityType}`;
  }

  get searchEnabled(): boolean {
    const metaConfig = this.getMetaConfig();
    return metaConfig?.searchEnabled !== false;
  }

  get paginationEnabled(): boolean {
    const metaConfig = this.getMetaConfig();
    return metaConfig?.paginationEnabled !== false;
  }
}
