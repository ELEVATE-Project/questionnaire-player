import {
  Component,
  ContentChild,
  HostListener,
  Input,
  OnInit,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  Validators,
} from '@angular/forms';
import { MatrixQuestion, Question } from '../../interfaces/questionnaire.type';
import { UtilsService } from '../../services/utils.service';
import { AlertComponent } from '../alert/alert.component';
import { MatDialog } from '@angular/material/dialog';
export interface IContext {
  questions: Question[];
  heading: string;
  index: number;
}
@Component({
  selector: 'lib-matrix-questions',
  templateUrl: './matrix-questions.component.html',
  styleUrls: ['./matrix-questions.component.scss'],
})
export class MatrixQuestionsComponent implements OnInit {
  @HostListener('window:popstate', ['$event'])
  onPopState(event) {
    this.showBadgeAssingModel = false;
  }
  @ContentChild('libMainTemplateRef', { static: false })
  libMainTemplateRef: TemplateRef<any>;
  addText: string;
  submitText: string;
  cancelText: string;
  @Input() questionnaireForm: FormGroup;
  @Input() question: MatrixQuestion | any;
  matrixForm: FormGroup;
  @ViewChild('modal') public modalTemplate: TemplateRef<any>;
  context: IContext;
  showBadgeAssingModel: boolean;
  instanceLastUpdated: any[] = [];
  constructor(
    public fb: FormBuilder,
    private dialog: MatDialog,
    public utilService: UtilsService
  ) { }

  ngOnInit(): void {
    this.addText = 'Add';
    this.submitText = 'Submit';
    this.cancelText = 'Cancel';
    setTimeout(() => {
      this.matrixForm = this.fb.group({},Validators.required);
      
      // Check if the matrix question is required
      const validation = this.question.validation;
      const isRequired = typeof validation !== 'string' && validation?.required;
      
      // Create FormArray with validators only if required
      const validators = isRequired ? [Validators.required] : [];
      
      this.questionnaireForm.setControl(
        this.question._id,
        new FormArray([], validators)
      );
      this.initializeMatrix();
    });
  }
  initializeMatrix() {
  /* Binding the instanceValidation function to the current context ('this') 
    to ensure correct 'this' reference within the validator function.*/
    const instanceValidationBound = this.instanceValidation.bind(this)
    if (this.question.value.length) {
      this.question.value.map((v) => {
        let obj = {};
        let endTime = [];
        v.forEach((ques) => {
          endTime.push(ques.endTime);
          if (!ques.value) return;
          obj[ques._id] = ques.value;
        });
        (this.questionnaireForm.controls[this.question._id] as FormArray).push(
          new FormControl(obj, [instanceValidationBound])
        );
        let instanceupdatedAt = endTime.reduce(function (x, y) {
          return x > y ? x : y;
        });
        this.instanceLastUpdated.push(instanceupdatedAt);
      });
    }
  }

  instanceValidation(control: FormControl) {
    // Only validate if the matrix question is required
    const validation = this.question.validation;
    const isRequired = typeof validation !== 'string' && validation?.required;
    
    if (!isRequired) {
      // If not required, instance can be empty
      return null;
    }
    
    // If required, check if value is empty
    let value = control.value;
    if (this.utilService.isEmpty(value)) {
      return { err: 'Instance not filled' };
    }
    return null;
  }


  addInstances(): void {
    this.question.value = this.question.value ? this.question.value : [];
    this.question.value.push(
      JSON.parse(JSON.stringify(this.question.instanceQuestions))
    );
    this.matrixForm.reset();
    
    // Check if the matrix question is required
    const validation = this.question.validation;
    const isRequired = typeof validation !== 'string' && validation?.required;
    
    // Add validator only if required
    const validators = isRequired ? [Validators.required] : [];
    this.formAsArray.push(new FormControl([], validators));
  }

  viewInstance(i): void {
    this.matrixForm = this.fb.group({},Validators.required);
    if (this.formAsArray.controls[i].value) {
      this.matrixForm.patchValue(this.formAsArray.controls[i].value);
    }
    this.dialog.open(this.modalTemplate, {
      width: '90vw',
      maxWidth: '100vw',  
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
      disableClose: true,
      hasBackdrop:true
    });
    let deepClonedQuestion = structuredClone(this.question.value[i]);
    this.context = {
      questions: deepClonedQuestion,
      heading: `${this.question.instanceIdentifier} ${i + 1}`,
      index: i,
    };
    this.showBadgeAssingModel = true;
  }

  get formAsArray() {
    return this.questionnaireForm.controls[this.question._id] as FormArray;
  }

  matrixSubmit(index) {
    this.showBadgeAssingModel = false;
    this.question.value[index] = this.context.questions;
    this.formAsArray.at(index).patchValue(this.matrixForm.value);
    if (this.matrixForm.invalid) {
      this.formAsArray
        .at(index)
        .setErrors({ err: 'Matrix response is invalid' });
    }
    this.instanceLastUpdated[index] = Date.now();
    this.closeModal();
  }

  async deleteInstanceAlert(index) {
    const alertConfig = {
      title: 'Delete',
      message: 'Delete Submission?',
      acceptLabel: 'Yes',
      cancelLabel: 'No',
    };
    const dialogRef = this.dialog.open(AlertComponent, {
      data: alertConfig,
      width: 'auto',
      enterAnimationDuration: 300,
      exitAnimationDuration: 150,
    });

    dialogRef.afterClosed().subscribe((res) => {
      if (!res) {
        return;
      }
      this.question.value.splice(index, 1);
      (
        this.questionnaireForm.controls[this.question._id] as FormArray
      ).removeAt(index);
      this.instanceLastUpdated.splice(index, 1);
    });
  }

  closeModal() {
    this.dialog.closeAll();
  }

  /**
   * Get the first 5 filled fields from an instance
   * @param instanceIndex The index of the instance
   * @returns Array of objects with question label and value
   */
  getInstancePreviewData(instanceIndex: number): { label: string; value: any }[] {
    if (!this.question.value || !this.question.value[instanceIndex]) {
      return [];
    }

    const instance = this.question.value[instanceIndex];
    const filledFields: { label: string; value: any }[] = [];

    for (const ques of instance) {
      if (ques.value !== null && ques.value !== undefined && ques.value !== '') {
        // Get the label from various possible sources
        let label = 'Field';
        
        if (ques.question) {
          // Handle case where question is an array (most common)
          if (Array.isArray(ques.question) && ques.question.length > 0) {
            label = ques.question[0];
          } else if (typeof ques.question === 'string') {
            label = ques.question;
          }
        } else if (ques.label) {
          label = ques.label;
        } else if (ques.text) {
          label = ques.text;
        }
        
        filledFields.push({
          label: label,
          value: this.formatValue(ques.value)
        });
      }
      
      // Stop after getting 5 fields
      if (filledFields.length >= 5) {
        break;
      }
    }

    return filledFields;
  }

  /**
   * Check if instance has more than 5 filled fields
   * @param instanceIndex The index of the instance
   * @returns True if there are more than 5 filled fields
   */
  hasMoreFields(instanceIndex: number): boolean {
    if (!this.question.value || !this.question.value[instanceIndex]) {
      return false;
    }

    const instance = this.question.value[instanceIndex];
    let filledCount = 0;

    for (const ques of instance) {
      if (ques.value !== null && ques.value !== undefined && ques.value !== '') {
        filledCount++;
      }
      
      if (filledCount > 5) {
        return true;
      }
    }

    return false;
  }

  /**
   * Format the value for display
   * @param value The value to format
   * @returns Formatted string
   */
  private formatValue(value: any): string {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
}
