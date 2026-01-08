import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Question } from '../../interfaces/questionnaire.type';
import { QuestionnaireService } from '../../services/questionnaire.service';

@Component({
  selector: 'lib-select-dropdown-input',
  templateUrl: './select-dropdown-input.component.html',
  styleUrls: ['./select-dropdown-input.component.scss'],
})
export class SelectDropdownInputComponent implements OnInit {
  @Input() options: any[];
  @Input() questionnaireForm: FormGroup;
  @Input() question: Question;
  @Output() dependentParent = new EventEmitter<Question>();

  constructor(public qService: QuestionnaireService) {}

  ngOnInit() {
    setTimeout(() => {
      // Check if multi-select mode (based on responseType or question options)
      const isMultiSelect = this.isMultiSelect;

      if (isMultiSelect) {
        // Multi-select: Use FormControl with array value
        const questionValue = Array.isArray(this.question.value) 
          ? this.question.value 
          : this.question.value 
            ? [this.question.value] 
            : [];
        
        this.questionnaireForm.addControl(
          this.question._id,
          new FormControl(questionValue, this.qService.validate(this.question))
        );
      } else {
        // Single-select: Use FormControl
        this.questionnaireForm.addControl(
          this.question._id,
          new FormControl(this.question.value || null, [
            this.qService.validate(this.question)
          ])
        );
      }

      this.question.startTime = this.question.startTime
        ? this.question.startTime
        : Date.now();
      
      if (this.question.value) {
        if (this.question.children && this.question.children.length) {
          this.dependentParent.emit(this.question);
        }
      }
    });
  }

  onChange(value: any) {
    if (this.isMultiSelect) {
      // For multi-select, value is already an array from mat-select
      const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
      this.question.value = selectedValues.filter(
        (val) => val !== '' && val !== null && val !== undefined
      );
    } else {
      // Single-select
      this.question.value = value || '';
    }

    this.question.endTime = Date.now();

    if (this.question.children && this.question.children.length) {
      this.dependentParent.emit(this.question);
    }
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

  get isMultiSelect(): boolean {
    // Check if multi-select is enabled via responseType or options configuration
    // Supports: multiselect-dropdown, multiselect, or options.multiSelect flag
    return this.question.responseType === 'multiselect-dropdown' ||
           this.question.responseType === 'multiselect' || 
           (this.question.options && typeof this.question.options === 'object' && this.question.options.multiSelect === true);
  }
}

