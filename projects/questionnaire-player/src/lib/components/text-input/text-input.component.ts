import { Component, Input, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validator, Validators } from '@angular/forms';
import { Question, Validation } from '../../interfaces/questionnaire.type';
import { QuestionnaireService } from '../../services/questionnaire.service';

@Component({
  selector: 'lib-text-input',
  templateUrl: './text-input.component.html',
  styleUrls: ['./text-input.component.scss']
})
export class TextInputComponent implements OnInit {
  text: string;
  maxLength: number | string;
  minLength: number | string;
  @Input() questionnaireForm: FormGroup;
  @Input() question : Question;
  placeholder;

  constructor(public qService:QuestionnaireService) {}

  ngOnInit() {
    this.placeholder = 'Enter your response';
    const validation = this.question.validation as any;
    
    // Set maxLength from validation
    if (validation && validation.maxLength !== undefined && validation.maxLength !== null && validation.maxLength !== '') {
      this.maxLength = typeof validation.maxLength === 'string' ? parseInt(validation.maxLength, 10) : validation.maxLength;
    } else {
      this.maxLength = null;
    }

    // Set minLength from validation
    if (validation && validation.minLength !== undefined && validation.minLength !== null && validation.minLength !== '') {
      this.minLength = typeof validation.minLength === 'string' ? parseInt(validation.minLength, 10) : validation.minLength;
    } else {
      this.minLength = null;
    }

    setTimeout(() => {
      this.questionnaireForm.addControl(
        this.question._id,
        new FormControl(this.question.value || null, [
          this.qService.validate(this.question)
        ])
      );
      this.question.startTime = this.question.startTime
        ? this.question.startTime
        : Date.now();
    });
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
  
  onChange(e: Event) {
    let value = (e.target as HTMLInputElement).value;
    this.question.value = value;
    this.question.endTime = Date.now();
  }
}
