import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { Question } from '../../interfaces/questionnaire.type';
import { QuestionnaireService } from '../../services/questionnaire.service';

@Component({
  selector: 'lib-number-input',
  templateUrl: './number-input.component.html',
  styleUrls: ['./number-input.component.scss'],
})
export class NumberInputComponent implements OnInit {
  placeholder;
  response: string;
  minValue: number | string;
  maxValue: number | string;
  minLength: number | string;
  maxLength: number | string;
  @Input() questionnaireForm: FormGroup;
  @Input() question: Question;
  constructor(public qService:QuestionnaireService) {}

  ngOnInit() {
    this.placeholder = 'Enter your response';
    const validation = this.question.validation as any;
    // Set min value from validation, default to 0 if min is "0" or 0
    if (validation && validation.min !== undefined && validation.min !== null && validation.min !== '') {
      this.minValue = typeof validation.min === 'string' ? parseFloat(validation.min) : validation.min;
    } else {
      this.minValue = null;
    }

    if (validation && validation.max !== undefined && validation.max !== null && validation.max !== '') {
      this.minLength = typeof validation.max === 'string' ? parseFloat(validation.max) : validation.max;
    } else {
      this.minLength = null;
    }

    // Also handle maxlength if provided in validation or question
    if (validation && validation.minLength !== undefined && validation.minLength !== null && validation.minLength !== '') {
      this.minLength = typeof validation.minLength === 'string' ? parseInt(validation.minLength, 10) : validation.minLength;
    } else if ((this.question as any).minLength !== undefined && (this.question as any).minLength !== null && (this.question as any).minLength !== '') {
      this.minLength = typeof (this.question as any).minLength === 'string' ? parseInt((this.question as any).minLength, 10) : (this.question as any).minLength;
    } else {
      this.minLength = null;
    }

    // Also handle maxlength if provided in validation or question
    if (validation && validation.maxLength !== undefined && validation.maxLength !== null && validation.maxLength !== '') {
      this.maxLength = typeof validation.maxLength === 'string' ? parseInt(validation.maxLength, 10) : validation.maxLength;
    } else if ((this.question as any).maxLength !== undefined && (this.question as any).maxLength !== null && (this.question as any).maxLength !== '') {
      this.maxLength = typeof (this.question as any).maxLength === 'string' ? parseInt((this.question as any).maxLength, 10) : (this.question as any).maxLength;
    } else {
      this.maxLength = null;
    }
    setTimeout(() => {
      this.questionnaireForm.addControl(
        this.question._id,
        new FormControl(this.question.value || null, [
          this.qService.validate(this.question),
        ])
      );
      this.question.startTime = this.question.startTime
        ? this.question.startTime
        : Date.now();
    });
  }
  onChange(e: Event) {
    let value = (e.target as HTMLInputElement).value;
    this.question.value = value;

    this.question.endTime = Date.now();
  }

  get isValid(): boolean {
    return this.questionnaireForm.controls[this.question._id].valid;
  }

  get isTouched(): boolean {
    return this.questionnaireForm.controls[this.question._id].touched;
  }

  getValidationMessage(controlName: string): string {
    const control = this.questionnaireForm.get(controlName);
    if (control.errors) {
      const validationErrors = control.errors;
      if (validationErrors['err']) {
        return validationErrors['err'];
      }
    }
    return '';
  }
}
