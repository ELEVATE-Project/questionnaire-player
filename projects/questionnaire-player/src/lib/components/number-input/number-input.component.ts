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
